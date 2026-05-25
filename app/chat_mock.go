package app

import (
	"context"
	"fmt"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// MockMode 全局 mock 开关，为 true 时 SendMessage 不请求大模型，返回模拟流式数据
var MockMode = true

// mockReply 是 mock 模式下返回的假回复文本
const mockReply = `你好！我是模拟的 AI 助手 🤖

这是一条**假数据**回复，用于测试流式输出效果。

Mock 模式下不会真实请求大模型，每个字符会以约 100ms 的间隔慢慢"吐出"，模拟真实的流式输出体验。

功能特性：
- ✅ 流式事件推送（chat:delta）
- ✅ 完成事件（chat:done）
- ✅ 无需网络请求
- ✅ 支持随时切换`

// mockSendMessage 模拟大模型慢慢吐字，通过 Wails Events 推送增量文本到前端
func (c *Chat) mockSendMessage(ctx context.Context) Message {
	runes := []rune(mockReply)
	var fullText string
	for _, r := range runes {
		select {
		case <-ctx.Done():
			// context 被取消，发送停止事件并返回已生成的内容
			runtime.EventsEmit(c.ctx, "chat:stopped", fullText)
			return Message{
				ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
				Role:    "assistant",
				Content: fullText,
				Time:    time.Now().Unix(),
			}
		default:
		}
		fullText += string(r)
		runtime.EventsEmit(c.ctx, "chat:delta", string(r))
		time.Sleep(100 * time.Millisecond)
	}
	runtime.EventsEmit(c.ctx, "chat:done", fullText)
	return Message{
		ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:    "assistant",
		Content: fullText,
		Time:    time.Now().Unix(),
	}
}
