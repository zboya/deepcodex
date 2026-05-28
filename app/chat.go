package app

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/zboya/deepcodex/agent/apitypes"
	"github.com/zboya/deepcodex/agent/harness"
	"github.com/zboya/deepcodex/agent/session"
	"github.com/zboya/deepcodex/app/agui"
)

// Chat manages AI conversation sessions for a specific working directory.
type Chat struct {
	ctx context.Context
	mu  sync.Mutex // protects concurrent sends

	harness *harness.Harness

	workDir string // the working directory for this chat instance

	cancelSend context.CancelFunc // cancels the current SendMessage context
	cancelMu   sync.Mutex         // protects cancelSend
}

// ChatItem represents a chat session in the UI, with metadata for display.
type InputMessage struct {
	ChatID      string           `json:"chat_id,omitempty"`
	Model       string           `json:"model,omitempty"`
	UserInput   string           `json:"user_input,omitempty"`
	ImagePaths  []string         `json:"image_paths,omitempty"`
	Attachments []AGUIAttachment `json:"attachments,omitempty"`
	Proj        ProjectEntry     `json:"proj,omitempty"`
	SendOptions SendOptions      `json:"send_options,omitempty"`
}

// AGUIAttachment is the subset of CopilotKit / AG-UI input content parts that
// deepcodex can forward to the harness. Today only images are converted into
// multimodal LLM blocks; other modalities are ignored by buildInputMessage.
type AGUIAttachment struct {
	Type     string           `json:"type,omitempty"`
	Source   AGUIInputSource  `json:"source,omitempty"`
	Metadata map[string]any   `json:"metadata,omitempty"`
}

type AGUIInputSource struct {
	Type     string `json:"type,omitempty"`
	Value    string `json:"value,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
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

// NewChatWithWorkDir creates a Chat instance tied to a specific working directory and session dir.
// sessDir specifies where sessions are stored (e.g. "<workDir>/.port_sessions").
func NewChatWithWorkDir(ctx context.Context, workDir string) *Chat {
	h, err := harness.New(harness.Options{
		WorkDir: workDir,
	})
	if err != nil {
		slog.Error(fmt.Sprintf("[app] failed to initialize harness for workDir=%s: %v", workDir, err))
		os.Exit(1)
	}
	return &Chat{
		ctx:     ctx,
		harness: h,
		workDir: workDir,
	}
}

// GetHarness returns the underlying Harness instance, which may be nil if not initialized.
func (c *Chat) GetHarness() *harness.Harness {
	return c.harness
}

// GetSessionMessages 返回指定会话 ID 的历史消息列表（只读，不恢复到 harness）
func (c *Chat) GetSessionMessages(sessionID string) []Message {
	s, err := c.harness.SessionStore.Load(sessionID)
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
	metas, err := c.harness.SessionStore.ListSessions()
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
func (c *Chat) SendMessage(input *InputMessage) Message {
	slog.Info("[app] SendMessage called", "chatID", input.ChatID, "model", input.Model, "userInput", input.UserInput, "projPath", input.Proj.Path, "sendOptions", input.SendOptions)
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

	p := FindModelProvider(input.Model)
	if p == nil {
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: fmt.Sprintf("[错误] 未找到模型所属的 provider: %s", input.Model),
			Time:    time.Now().Unix(),
		}
	}
	c.harness.Init(harness.ModelOptions{
		Model:  input.Model,
		APIKey: p.APIKey,
	})

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
	if err := c.applySessionOpts(input.SendOptions); err != nil {
		slog.Warn("[app] SendMessage: failed to load session", "err", err)
		// Non-fatal: continue with fresh context
	}

	// 创建 AG-UI emitter，threadID 取 chatID
	em := agui.New(c.ctx, input.ChatID)
	em.RunStarted()

	// 根据文本、图片路径和 CopilotKit AG-UI 附件构造 harness 输入消息。
	var (
		ch  <-chan apitypes.StreamEvent
		err error
	)
	msg, buildErr := buildInputMessage(input.UserInput, input.ImagePaths, input.Attachments)
	if buildErr != nil {
		errMsg := fmt.Sprintf("[错误] 读取附件失败: %v", buildErr)
		em.RunError(errMsg)
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: errMsg,
			Time:    time.Now().Unix(),
		}
	}
	ch, err = c.harness.Run(ctx, msg)
	if err != nil {
		errMsg := fmt.Sprintf("[错误] %v", err)
		em.RunError(errMsg)
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
		}
		if ev.ContentBlock != nil && ev.ContentBlock.Kind == "text" && ev.ContentBlock.Text != "" {
			fullText += ev.ContentBlock.Text
		}

		// 通过 emitter 发送标准 AG-UI 事件（文本/工具调用全部覆盖）
		em.Translate(ev)
	}

	usage := c.harness.GetUsage()
	em.RunFinished(&agui.Usage{
		InputTokens:  usage.InputTokens,
		OutputTokens: usage.OutputTokens,
	})

	// 持久化本轮对话到 sessionStore，保证侧边栏"项目 → 会话"列表能看到
	c.persistTurn(input, fullText, usage.InputTokens, usage.OutputTokens)

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

// ContinueRecentSession loads the most recent session for the current working directory
// into the harness runtime, enabling conversation continuity across restarts.
// Returns an error if no session is found.
func (c *Chat) ContinueRecentSession() error {
	cwd := c.workDir
	if cwd == "" {
		return fmt.Errorf("working directory not set")
	}
	s, err := c.harness.SessionStore.FindMostRecent(cwd)
	if err != nil {
		return fmt.Errorf("no recent session for %s: %w", cwd, err)
	}
	slog.Info("[app] ContinueRecentSession: restoring session", "sessionID", s.SessionID)
	return c.restoreStoredSession(s)
}

// ResumeSession loads a specific session by ID into the harness runtime.
func (c *Chat) ResumeSession(sessionID string) error {
	s, err := c.harness.SessionStore.Load(sessionID)
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
func (c *Chat) persistTurn(input *InputMessage, assistantText string, inputTokens, outputTokens int) {
	if c.harness.SessionStore == nil || input.ChatID == "" {
		return
	}

	stored, err := c.harness.SessionStore.Load(input.ChatID)
	if err != nil {
		// 不存在则新建一份
		stored = session.StoredSession{
			SessionID:  input.ChatID,
			WorkingDir: c.workDir,
		}
	}

	// 多模态消息：图片路径以 markdown 形式附加在文本中保存，
	// 便于会话恢复时仍能看到 user 引用过的图片。
	displayUserText := input.UserInput
	if len(input.ImagePaths) > 0 {
		var buf []byte
		for _, p := range input.ImagePaths {
			buf = append(buf, []byte(fmt.Sprintf("\n![image](%s)", p))...)
		}
		displayUserText = input.UserInput + string(buf)
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

	if _, err := c.harness.SessionStore.Save(stored); err != nil {
		slog.Warn("[app] persistTurn: save session failed",
			"chatID", input.ChatID, "err", err)
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
		s, err := c.harness.SessionStore.Load(opts.ResumeSessionID)
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
		s, err := c.harness.SessionStore.FindMostRecent(cwd)
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

// buildInputMessage constructs a multimodal user message from legacy image
// paths and CopilotKit/AG-UI attachment parts.
func buildInputMessage(text string, imagePaths []string, attachments []AGUIAttachment) (apitypes.InputMessage, error) {
	if len(imagePaths) == 0 && len(attachments) == 0 {
		return apitypes.UserText(text), nil
	}

	blocks := make([]apitypes.InputContentBlock, 0, len(imagePaths)+len(attachments)+1)
	for _, p := range imagePaths {
		if p == "" {
			continue
		}
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

	for _, att := range attachments {
		if att.Type != "image" {
			continue
		}
		block, err := attachmentToImageBlock(att)
		if err != nil {
			return apitypes.InputMessage{}, err
		}
		blocks = append(blocks, block)
	}

	if text != "" {
		blocks = append(blocks, apitypes.InputContentBlock{Kind: "text", Text: text})
	}
	return apitypes.InputMessage{Role: "user", Content: blocks}, nil
}

func attachmentToImageBlock(att AGUIAttachment) (apitypes.InputContentBlock, error) {
	source := att.Source
	switch source.Type {
	case "data":
		mimeType := source.MimeType
		if mimeType == "" {
			mimeType = "image/png"
		}
		data := source.Value
		if comma := strings.Index(data, ","); comma >= 0 && strings.Contains(data[:comma], "base64") {
			data = data[comma+1:]
		}
		if _, err := base64.StdEncoding.DecodeString(data); err != nil {
			return apitypes.InputContentBlock{}, fmt.Errorf("invalid base64 image attachment: %w", err)
		}
		return apitypes.InputContentBlock{
			Kind: "image",
			Source: &apitypes.ImageSource{
				Type:      "base64",
				MediaType: mimeType,
				Data:      data,
			},
		}, nil
	case "url":
		path, _ := att.Metadata["path"].(string)
		if path == "" && strings.HasPrefix(source.Value, "file://") {
			path = strings.TrimPrefix(source.Value, "file://")
		}
		if path == "" {
			return apitypes.InputContentBlock{}, fmt.Errorf("unsupported image URL attachment: %s", source.Value)
		}
		single, err := apitypes.UserImageAndText("", path)
		if err != nil {
			return apitypes.InputContentBlock{}, fmt.Errorf("loading image %s: %w", path, err)
		}
		for _, b := range single.Content {
			if b.Kind == "image" {
				return b, nil
			}
		}
		return apitypes.InputContentBlock{}, fmt.Errorf("no image block built for %s", path)
	default:
		return apitypes.InputContentBlock{}, fmt.Errorf("unsupported image attachment source type: %s", source.Type)
	}
}
