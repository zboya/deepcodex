package app

import (
	"context"
	"fmt"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/zboya/deepcodex/app/agui"
)

// MockMode 全局 mock 开关，为 true 时 SendMessage 不请求大模型，返回模拟流式数据
var MockMode = true

// mockReply 是 mock 模式下返回的假回复文本
const mockReply = `你好！我是模拟的 AI 助手 🤖

这是一条**假数据**回复，用于测试流式输出效果。

Mock 模式下不会真实请求大模型，每个字符会以约 100ms 的间隔慢慢"吐出"，模拟真实的流式输出体验。

功能特性：
- ✅ AG-UI 标准事件流（agui:event）
- ✅ 旧事件兼容（chat:delta / chat:done / chat:stopped）
- ✅ 无需网络请求
- ✅ 支持随时取消`

// mockSendMessage 模拟大模型慢慢吐字。
// 同时通过 AG-UI Emitter 推送标准事件（RUN_STARTED / TEXT_MESSAGE_* / RUN_FINISHED|ERROR），
// 并在 EmitLegacyEvents=true 时继续兼容旧的 chat:delta / chat:done / chat:stopped 事件。
func (c *Chat) mockSendMessage(ctx context.Context, chatID string) Message {
	em := agui.New(c.ctx, chatID)
	em.RunStarted()

	runes := []rune(mockReply)
	var fullText string
	for _, r := range runes {
		select {
		case <-ctx.Done():
			// context 被取消：先关闭 AG-UI 流，再发旧事件保持兼容
			em.RunError("cancelled")
			if EmitLegacyEvents {
				runtime.EventsEmit(c.ctx, "chat:stopped", fullText)
			}
			return Message{
				ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
				Role:    "assistant",
				Content: fullText,
				Time:    time.Now().Unix(),
			}
		default:
		}
		piece := string(r)
		fullText += piece

		// AG-UI: TEXT_MESSAGE_START（首字时自动发） + TEXT_MESSAGE_CONTENT
		em.TextDelta(piece)
		// 旧事件兼容
		if EmitLegacyEvents {
			runtime.EventsEmit(c.ctx, "chat:delta", piece)
		}
		time.Sleep(100 * time.Millisecond)
	}

	// 收尾：闭合 TEXT_MESSAGE_END + RUN_FINISHED；mock 没有真实 token usage
	em.RunFinished(nil)
	if EmitLegacyEvents {
		runtime.EventsEmit(c.ctx, "chat:done", fullText)
	}
	return Message{
		ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:    "assistant",
		Content: fullText,
		Time:    time.Now().Unix(),
	}
}
