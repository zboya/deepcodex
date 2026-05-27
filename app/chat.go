package app

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/zboya/deepcodex/agent/agent"
	"github.com/zboya/deepcodex/agent/apitypes"
	"github.com/zboya/deepcodex/agent/harness"
	"github.com/zboya/deepcodex/agent/session"
	"github.com/zboya/deepcodex/agent/worktree"
	"github.com/zboya/deepcodex/app/agui"
)

// EmitLegacyEvents controls whether the legacy chat:* events ("chat:delta" /
// "chat:done" / "chat:stopped") are still emitted alongside the new AG-UI
// events on channel "agui:event". Kept temporarily to ease frontend migration;
// flip to false once the frontend fully consumes AG-UI events.
var EmitLegacyEvents = true

// Chat manages AI conversation sessions for a specific working directory.
type Chat struct {
	ctx     context.Context
	mu      sync.Mutex // protects concurrent sends
	harness *harness.Harness

	workDir      string                // the working directory for this chat instance
	sessionStore *session.SessionStore // persists conversation sessions

	cancelSend context.CancelFunc // cancels the current SendMessage context
	cancelMu   sync.Mutex         // protects cancelSend
}

// Project 项目信息
type Project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

// ChatItem 对话条目
type ChatItem struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	CreatedAt  int64  `json:"createdAt"`
	WorkingDir string `json:"workingDir,omitempty"`
}

// Message 单条消息
type Message struct {
	ID      string `json:"id"`
	Role    string `json:"role"` // user / assistant / system
	Content string `json:"content"`
	Time    int64  `json:"time"`
}

// SendOptions controls session loading behaviour for SendMessage.
type SendOptions struct {
	// ContinueSession loads the most recent session for the current working directory
	// before sending the message (equivalent to `deepcodex chat -c`).
	ContinueSession bool `json:"continueSession"`

	// ResumeSessionID loads a specific session by ID before sending the message
	// (equivalent to `deepcodex chat -r <id>`).
	// Takes precedence over ContinueSession when non-empty.
	ResumeSessionID string `json:"resumeSessionID"`
}

// NewChat 创建 Chat 实例
// workDir specifies the project working directory. Pass "" to use the current directory.
func NewChat(ctx context.Context, h *harness.Harness) *Chat {
	// Determine session storage directory
	sessDir := worktree.SessionDir()
	if sessDir == "" {
		sessDir = filepath.Join(".deepcodex", "sessions")
	}
	return NewChatWithWorkDir(ctx, h, "", sessDir)
}

// NewChatWithWorkDir creates a Chat instance tied to a specific working directory and session dir.
// sessDir specifies where sessions are stored (e.g. "<workDir>/.port_sessions").
func NewChatWithWorkDir(ctx context.Context, h *harness.Harness, workDir string, sessDir string) *Chat {
	if sessDir == "" {
		sessDir = filepath.Join(workDir, ".port_sessions")
	}
	return &Chat{
		ctx:          ctx,
		harness:      h,
		workDir:      workDir,
		sessionStore: session.NewSessionStore(sessDir),
	}
}

// GetSessionMessages 返回指定会话 ID 的历史消息列表（只读，不恢复到 harness）
func (c *Chat) GetSessionMessages(sessionID string) []Message {
	s, err := c.sessionStore.Load(sessionID)
	if err != nil {
		return []Message{}
	}
	var msgs []Message
	for i, m := range s.Messages {
		msgs = append(msgs, Message{
			ID:      fmt.Sprintf("%s-msg-%d", sessionID, i),
			Role:    m.Role,
			Content: m.Content,
			Time:    time.Now().Unix(),
		})
	}
	return msgs
}

// ListChats returns saved chat sessions for the current working directory.
func (c *Chat) ListChats() []ChatItem {
	metas, err := c.sessionStore.ListSessions()
	if err != nil {
		slog.Warn("[app] ListChats: failed to list sessions", "err", err)
		return []ChatItem{}
	}

	var items []ChatItem
	for _, m := range metas {
		// Filter by working directory when one is set
		if c.workDir != "" && m.WorkingDir != "" && m.WorkingDir != c.workDir {
			continue
		}
		title := m.Summary
		if title == "" {
			title = m.SessionID
		}
		items = append(items, ChatItem{
			ID:         m.SessionID,
			Title:      title,
			CreatedAt:  m.ModTime.Unix(),
			WorkingDir: m.WorkingDir,
		})
	}
	return items
}

// CreateChat 新建对话（占位）
func (c *Chat) CreateChat(title string) ChatItem {
	return ChatItem{
		ID:         fmt.Sprintf("chat-%d", time.Now().UnixNano()),
		Title:      title,
		CreatedAt:  time.Now().Unix(),
		WorkingDir: c.workDir,
	}
}

// SendMessage 向对话发送消息，流式返回结果。
// opts 为可选的 session 加载选项（continueSession / resumeSessionID）。
// imagePaths 为可选的图片路径列表，非空时通过多模态消息发送（基于 ChatStreamWithMessage）。
// 前端通过监听 "chat:delta" 事件接收流式文本片段，
// 监听 "chat:done" 事件接收完成信号。
func (c *Chat) SendMessage(chatID string, content string, imagePaths []string, opts SendOptions) Message {
	// 创建可取消的 context，并保存 cancel 供 StopMessage 使用
	ctx, cancel := context.WithCancel(context.Background())
	c.cancelMu.Lock()
	if c.cancelSend != nil {
		c.cancelSend() // 取消上一个未完成的请求
	}
	c.cancelSend = cancel
	c.cancelMu.Unlock()
	defer func() {
		c.cancelMu.Lock()
		c.cancelSend = nil
		c.cancelMu.Unlock()
		cancel()
	}()

	if c.harness == nil {
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: "[错误] AI 引擎未初始化",
			Time:    time.Now().Unix(),
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Load historical session if requested (before sending the new message)
	if err := c.applySessionOpts(opts); err != nil {
		slog.Warn("[app] SendMessage: failed to load session", "err", err)
		// Non-fatal: continue with fresh context
	}

	// 创建 AG-UI emitter，threadID 取 chatID
	em := agui.New(c.ctx, chatID)
	em.RunStarted()

	// 根据是否有图片选择不同的发送通道：
	//   - 有图片：构建 InputMessage 并调用 ChatStreamWithMessage（多模态）
	//   - 无图片：保持原 ChatStream（纯文本）
	var (
		ch  <-chan apitypes.StreamEvent
		err error
	)
	if len(imagePaths) > 0 {
		msg, buildErr := buildImageMessage(content, imagePaths)
		if buildErr != nil {
			errMsg := fmt.Sprintf("[错误] 读取图片失败: %v", buildErr)
			em.RunError(errMsg)
			if EmitLegacyEvents {
				application.Get().Event.Emit("chat:done", errMsg)
			}
			return Message{
				ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
				Role:    "assistant",
				Content: errMsg,
				Time:    time.Now().Unix(),
			}
		}
		ch, err = c.harness.ChatStreamWithMessage(ctx, msg)
	} else {
		ch, err = c.harness.ChatStream(ctx, content)
	}
	if err != nil {
		errMsg := fmt.Sprintf("[错误] %v", err)
		em.RunError(errMsg)
		if EmitLegacyEvents {
			application.Get().Event.Emit("chat:done", errMsg)
		}
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: errMsg,
			Time:    time.Now().Unix(),
		}
	}

	var fullText string
	for ev := range ch {
		// 若 context 已取消，停止读取
		select {
		case <-ctx.Done():
			em.RunError("cancelled")
			if EmitLegacyEvents {
				application.Get().Event.Emit("chat:stopped", fullText)
			}
			return Message{
				ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
				Role:    "assistant",
				Content: fullText,
				Time:    time.Now().Unix(),
			}
		default:
		}

		// 累积文本（用于返回值 + 旧事件兼容）
		if ev.BlockDelta != nil && ev.BlockDelta.Kind == "text_delta" {
			fullText += ev.BlockDelta.Text
			if EmitLegacyEvents {
				application.Get().Event.Emit("chat:delta", ev.BlockDelta.Text)
			}
		}
		if ev.ContentBlock != nil && ev.ContentBlock.Kind == "text" && ev.ContentBlock.Text != "" {
			fullText += ev.ContentBlock.Text
			if EmitLegacyEvents {
				application.Get().Event.Emit("chat:delta", ev.ContentBlock.Text)
			}
		}

		// 通过 emitter 发送标准 AG-UI 事件（文本/工具调用全部覆盖）
		em.Translate(ev)
	}

	usage := c.harness.GetUsage()
	em.RunFinished(&agui.Usage{
		InputTokens:  usage.InputTokens,
		OutputTokens: usage.OutputTokens,
	})
	if EmitLegacyEvents {
		application.Get().Event.Emit("chat:done", fullText)
	}

	// 持久化本轮对话到 sessionStore，保证侧边栏"项目 → 会话"列表能看到
	c.persistTurn(chatID, content, fullText, imagePaths, usage.InputTokens, usage.OutputTokens)

	return Message{
		ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:    "assistant",
		Content: fullText,
		Time:    time.Now().Unix(),
	}
}

// StopMessage 中止当前正在进行的 SendMessage 请求
func (c *Chat) StopMessage() {
	c.cancelMu.Lock()
	defer c.cancelMu.Unlock()
	if c.cancelSend != nil {
		slog.Info("[app] StopMessage called, cancelling current send")
		c.cancelSend()
		c.cancelSend = nil
	}
}

// SendMessageSync 非流式发送消息（备用接口）
func (c *Chat) SendMessageSync(chatID string, content string) Message {
	if c.harness == nil {
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: "[错误] AI 引擎未初始化",
			Time:    time.Now().Unix(),
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	resp, err := c.harness.Chat(context.Background(), content)
	if err != nil {
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: fmt.Sprintf("[错误] %v", err),
			Time:    time.Now().Unix(),
		}
	}

	var text string
	for _, block := range resp.Content {
		if block.Kind == "text" {
			text += block.Text
		}
	}

	return Message{
		ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:    "assistant",
		Content: text,
		Time:    time.Now().Unix(),
	}
}

// ContinueRecentSession loads the most recent session for the current working directory
// into the harness runtime, enabling conversation continuity across restarts.
// Returns an error if no session is found.
func (c *Chat) ContinueRecentSession() error {
	cwd := c.workDir
	if cwd == "" {
		return fmt.Errorf("working directory not set")
	}
	s, err := c.sessionStore.FindMostRecent(cwd)
	if err != nil {
		return fmt.Errorf("no recent session for %s: %w", cwd, err)
	}
	slog.Info("[app] ContinueRecentSession: restoring session", "sessionID", s.SessionID)
	return c.restoreStoredSession(s)
}

// ResumeSession loads a specific session by ID into the harness runtime.
func (c *Chat) ResumeSession(sessionID string) error {
	s, err := c.sessionStore.Load(sessionID)
	if err != nil {
		return fmt.Errorf("loading session %s: %w", sessionID, err)
	}
	slog.Info("[app] ResumeSession: restoring session", "sessionID", s.SessionID)
	return c.restoreStoredSession(s)
}

// GetUsage 获取 token 用量统计
func (c *Chat) GetUsage() map[string]interface{} {
	if c.harness == nil {
		return nil
	}
	usage := c.harness.GetUsage()
	return map[string]interface{}{
		"inputTokens":  usage.InputTokens,
		"outputTokens": usage.OutputTokens,
	}
}

// GetWorkDir returns the working directory associated with this Chat instance.
func (c *Chat) GetWorkDir() string {
	return c.workDir
}

func (c *Chat) Close() {
	if c.harness != nil {
		c.harness.Close()
	}
}

// persistTurn 把本轮的 user / assistant 消息追加到 chatID 对应的 session 文件。
// 若 session 不存在则新建。失败仅记录日志，不影响主流程。
//
// 这是 GUI 路径下让"项目 → 会话列表"能显示历史的关键：
// SendMessage 完成一次流式回包后调用，使 sessionStore 落盘，
// ListSessionsForProject 才能从 .port_sessions 里读到本会话。
func (c *Chat) persistTurn(chatID, userText, assistantText string, imagePaths []string, inputTokens, outputTokens int) {
	if c.sessionStore == nil || chatID == "" {
		return
	}

	stored, err := c.sessionStore.Load(chatID)
	if err != nil {
		// 不存在则新建一份
		stored = session.StoredSession{
			SessionID:  chatID,
			WorkingDir: c.workDir,
		}
	}

	// 多模态消息：图片路径以 markdown 形式附加在文本中保存，
	// 便于会话恢复时仍能看到 user 引用过的图片。
	displayUserText := userText
	if len(imagePaths) > 0 {
		var buf []byte
		for _, p := range imagePaths {
			buf = append(buf, []byte(fmt.Sprintf("\n![image](%s)", p))...)
		}
		displayUserText = userText + string(buf)
	}

	if displayUserText != "" {
		stored.Messages = append(stored.Messages, session.Message{
			Role:    "user",
			Content: displayUserText,
		})
	}
	if assistantText != "" {
		stored.Messages = append(stored.Messages, session.Message{
			Role:    "assistant",
			Content: assistantText,
		})
	}
	// 累计 token 使用
	stored.InputTokens += inputTokens
	stored.OutputTokens += outputTokens
	if stored.WorkingDir == "" {
		stored.WorkingDir = c.workDir
	}

	if _, err := c.sessionStore.Save(stored); err != nil {
		slog.Warn("[app] persistTurn: save session failed",
			"chatID", chatID, "err", err)
	}
}

// --- internal helpers ---

// applySessionOpts loads a historical session into the harness runtime based on SendOptions.
// It must be called with c.mu held.
func (c *Chat) applySessionOpts(opts SendOptions) error {
	if c.harness == nil {
		return nil
	}

	var loadedSession *session.StoredSession

	switch {
	case opts.ResumeSessionID != "":
		// Load specific session by ID
		s, err := c.sessionStore.Load(opts.ResumeSessionID)
		if err != nil {
			return fmt.Errorf("loading session %s: %w", opts.ResumeSessionID, err)
		}
		loadedSession = &s
		slog.Info("[app] applySessionOpts: resuming session", "sessionID", s.SessionID)

	case opts.ContinueSession:
		// Load most recent session for current working directory
		cwd := c.workDir
		if cwd == "" {
			return fmt.Errorf("ContinueSession requires a working directory")
		}
		s, err := c.sessionStore.FindMostRecent(cwd)
		if err != nil {
			return fmt.Errorf("no recent session for %s: %w", cwd, err)
		}
		loadedSession = &s
		slog.Info("[app] applySessionOpts: continuing session", "sessionID", s.SessionID)
	}

	if loadedSession != nil {
		return c.restoreStoredSession(*loadedSession)
	}
	return nil
}

// restoreStoredSession converts a StoredSession into InputMessages and restores it
// into the harness runtime.
func (c *Chat) restoreStoredSession(s session.StoredSession) error {
	var messages []apitypes.InputMessage
	for _, msg := range s.Messages {
		messages = append(messages, apitypes.InputMessage{
			Role: msg.Role,
			Content: []apitypes.InputContentBlock{
				{Kind: "text", Text: msg.Content},
			},
		})
	}
	c.harness.RestoreSession(messages)
	return nil
}

// newHarnessForWorkDir is a convenience helper that creates a Harness pre-configured
// for the given working directory, keeping options minimal for GUI usage.
// The caller is responsible for calling Close() on the returned Harness.
func newHarnessForWorkDir(workDir string, extraOpts ...func(*harness.Options)) (*harness.Harness, error) {
	opts := harness.Options{
		WorkDir:         workDir,
		SkipPermissions: true, // GUI typically runs without interactive permission prompts
		ToolCallback:    agent.NoOpToolCallback{},
	}
	for _, fn := range extraOpts {
		fn(&opts)
	}
	return harness.New(opts)
}

// buildImageMessage 构造一条包含若干图片 + 文本的多模态 user 消息。
// 单张图片直接复用 apitypes.UserImageAndText；多张图片时按顺序加载并附在文本前。
func buildImageMessage(text string, imagePaths []string) (apitypes.InputMessage, error) {
	if len(imagePaths) == 0 {
		return apitypes.UserText(text), nil
	}
	if len(imagePaths) == 1 {
		return apitypes.UserImageAndText(text, imagePaths[0])
	}

	// 多图：复用 UserImageAndText 解析逻辑（按顺序加载），把 image blocks 拼起来再补一段 text。
	blocks := make([]apitypes.InputContentBlock, 0, len(imagePaths)+1)
	for _, p := range imagePaths {
		single, err := apitypes.UserImageAndText("", p)
		if err != nil {
			return apitypes.InputMessage{}, fmt.Errorf("loading image %s: %w", p, err)
		}
		for _, b := range single.Content {
			if b.Kind == "image" {
				blocks = append(blocks, b)
			}
		}
	}
	if text != "" {
		blocks = append(blocks, apitypes.InputContentBlock{Kind: "text", Text: text})
	}
	return apitypes.InputMessage{Role: "user", Content: blocks}, nil
}
