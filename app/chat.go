package app

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/zboya/deepcodex/agent/harness"
)

type Chat struct {
	ctx     context.Context
	mu      sync.Mutex // protects concurrent sends
	harness *harness.Harness

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
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt int64  `json:"createdAt"`
}

// Message 单条消息
type Message struct {
	ID      string `json:"id"`
	Role    string `json:"role"` // user / assistant / system
	Content string `json:"content"`
	Time    int64  `json:"time"`
}

// NewChat 创建 Chat 实例
func NewChat(ctx context.Context, h *harness.Harness) *Chat {
	return &Chat{
		ctx:     ctx,
		harness: h,
	}
}

// ListChats 列出对话历史（占位）
func (c *Chat) ListChats() []ChatItem {
	return []ChatItem{}
}

// CreateChat 新建对话（占位）
func (c *Chat) CreateChat(title string) ChatItem {
	return ChatItem{
		ID:        fmt.Sprintf("chat-%d", time.Now().UnixNano()),
		Title:     title,
		CreatedAt: time.Now().Unix(),
	}
}

// SendMessage 向对话发送消息，流式返回结果
// 前端通过监听 "chat:delta" 事件接收流式文本片段，
// 监听 "chat:done" 事件接收完成信号。
// 该方法本身返回最终的完整响应。
func (c *Chat) SendMessage(chatID string, content string) Message {
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

	// Mock 模式：模拟大模型慢慢吐字
	if MockMode {
		return c.mockSendMessage(ctx)
	}

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

	// 使用流式对话，通过 Wails Events 推送增量文本到前端
	ch, err := c.harness.ChatStream(ctx, content)
	if err != nil {
		errMsg := fmt.Sprintf("[错误] %v", err)
		runtime.EventsEmit(c.ctx, "chat:done", errMsg)
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
			runtime.EventsEmit(c.ctx, "chat:stopped", fullText)
			return Message{
				ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
				Role:    "assistant",
				Content: fullText,
				Time:    time.Now().Unix(),
			}
		default:
		}
		// 处理文本增量
		if ev.BlockDelta != nil && ev.BlockDelta.Kind == "text_delta" {
			fullText += ev.BlockDelta.Text
			runtime.EventsEmit(c.ctx, "chat:delta", ev.BlockDelta.Text)
		}
		// 处理新的文本块开始（可能携带初始文本）
		if ev.ContentBlock != nil && ev.ContentBlock.Kind == "text" && ev.ContentBlock.Text != "" {
			fullText += ev.ContentBlock.Text
			runtime.EventsEmit(c.ctx, "chat:delta", ev.ContentBlock.Text)
		}
	}

	runtime.EventsEmit(c.ctx, "chat:done", fullText)

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

func (c *Chat) Close() {
	if c.harness != nil {
		c.harness.Close()
	}
}
