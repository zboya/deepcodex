package app

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/zboya/deepcodex/app/agui"
)

// MockMode 全局 mock 开关，为 true 时 SendMessage 不请求大模型，返回模拟流式数据
var MockMode = false

// mockStep represents one step in the simulated agent interaction.
// A step is either a text segment or a tool call.
type mockStep struct {
	// Text-only step: emit as TEXT_MESSAGE_CONTENT
	text string
	// Tool call step (when toolName != "")
	toolName string
	toolArgs string
}

// mockScenario defines the full mock conversation sequence.
// It simulates: think → tool call → result text → tool call → result text → summary.
var mockScenario = []mockStep{
	{text: "让我来帮你分析一下项目结构。\n\n首先，我需要查看一下当前目录的文件列表：\n\n"},
	// Tool call 1: ListDirectoryTool
	{toolName: "ListDirectoryTool", toolArgs: `{"path": ".", "recursive": false}`},
	{text: "项目根目录包含以下结构：\n```\nagent/       — AI agent 核心模块\napp/         — Wails 应用层\nfrontend/    — React 前端\nmain.go      — 入口文件\nwails.json   — Wails 配置\n```\n\n接下来搜索一下关键函数：\n\n"},
	// Tool call 2: GrepTool
	{toolName: "GrepTool", toolArgs: `{"pattern": "SendMessage", "include": "*.go"}`},
	{text: "找到以下匹配：\n- `app/chat.go:42` — `func (c *Chat) SendMessage(...)`\n- `app/chat_mock.go:38` — `func (c *Chat) mockSendMessage(...)`\n\n让我读取一下核心实现：\n\n"},
	// Tool call 3: FileReadTool
	{toolName: "FileReadTool", toolArgs: `{"path": "app/chat.go", "start_line": 40, "end_line": 55}`},
	{text: "```go\nfunc (c *Chat) SendMessage(content string) Message {\n    // ... 核心消息发送逻辑\n}\n```\n\n再执行一下构建检查：\n\n"},
	// Tool call 4: BashTool
	{toolName: "BashTool", toolArgs: `{"command": "go build ./...", "timeout_ms": 30000}`},
	{text: "✅ 构建成功，无错误。\n\n最后搜索一下相关文档：\n\n"},
	// Tool call 5: WebSearchTool
	{toolName: "WebSearchTool", toolArgs: `{"query": "AG-UI protocol specification"}`},
	{text: `## 总结

项目架构清晰，主要分为三层：
1. **Agent 层** — LLM 交互、工具调度、会话管理
2. **App 层** — Wails 绑定、AG-UI 事件推送、前后端桥接
3. **Frontend 层** — React UI、消息渲染、流式展示

功能特性：
- ✅ AG-UI 标准事件流（TEXT_MESSAGE + TOOL_CALL）
- ✅ 工具调用全生命周期（START → ARGS → END）
- ✅ 旧事件兼容（chat:delta / chat:done / chat:stopped）
- ✅ 支持随时取消

🔗 相关链接：[知研平台](https://zhiyan.woa.com)
`},
}

// mockSendMessage 模拟完整的 AG-UI 协议流，包括：
//   - RUN_STARTED
//   - TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT / TEXT_MESSAGE_END
//   - TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END
//   - RUN_FINISHED
//
// 同时在 EmitLegacyEvents=true 时兼容旧的 chat:delta / chat:done / chat:stopped 事件。
func (c *Chat) mockSendMessage(ctx context.Context, chatID string) Message {
	slog.Info("[app] mockSendMessage: start",
		"chatID", chatID,
		"steps", len(mockScenario),
		"emitLegacyEvents", EmitLegacyEvents,
	)

	em := agui.New(c.ctx, chatID)
	em.RunStarted()

	var fullText string
	toolIndex := 0

	for stepIdx, step := range mockScenario {
		// Check cancellation
		select {
		case <-ctx.Done():
			slog.Warn("[app] mockSendMessage: context cancelled before step",
				"chatID", chatID,
				"stepIndex", stepIdx,
				"err", ctx.Err(),
				"fullTextLen", len(fullText),
			)
			em.RunError("cancelled")
			slog.Info("[app] mockSendMessage: emit RunError", "chatID", chatID, "reason", "cancelled")
			if EmitLegacyEvents {
				slog.Info("[app] mockSendMessage: emit legacy chat:stopped",
					"chatID", chatID, "fullTextLen", len(fullText))
				application.Get().Event.Emit("chat:stopped", fullText)
			}
			msg := Message{
				ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
				Role:    "assistant",
				Content: fullText,
				Time:    time.Now().Unix(),
			}
			slog.Info("[app] mockSendMessage: return cancelled message",
				"chatID", chatID, "msgID", msg.ID, "contentLen", len(msg.Content))
			return msg
		default:
		}

		if step.toolName != "" {
			// === Tool Call Step ===
			em.ToolCallStart(toolIndex, "", step.toolName)

			// Stream TOOL_CALL_ARGS character by character (simulating partial JSON)
			for _, r := range []rune(step.toolArgs) {
				select {
				case <-ctx.Done():
					slog.Warn("[app] mockSendMessage: context cancelled during tool args streaming",
						"chatID", chatID,
						"stepIndex", stepIdx,
						"toolIndex", toolIndex,
						"toolName", step.toolName,
						"err", ctx.Err(),
					)
					em.RunError("cancelled")
					slog.Info("[app] mockSendMessage: emit RunError", "chatID", chatID, "reason", "cancelled")
					if EmitLegacyEvents {
						slog.Info("[app] mockSendMessage: emit legacy chat:stopped",
							"chatID", chatID, "fullTextLen", len(fullText))
						application.Get().Event.Emit("chat:stopped", fullText)
					}
					msg := Message{
						ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
						Role:    "assistant",
						Content: fullText,
						Time:    time.Now().Unix(),
					}
					slog.Info("[app] mockSendMessage: return cancelled message",
						"chatID", chatID, "msgID", msg.ID, "contentLen", len(msg.Content))
					return msg
				default:
				}
				piece := string(r)
				em.ToolCallArgs(toolIndex, piece)
				slog.Debug("[app] mockSendMessage: emit ToolCallArgs",
					"chatID", chatID, "toolIndex", toolIndex, "delta", piece)
				time.Sleep(10 * time.Millisecond)
			}

			em.ToolCallEnd(toolIndex)
			toolIndex++

			// Simulate tool execution delay
			time.Sleep(10 * time.Millisecond)
		} else {
			// === Text Step ===
			for _, r := range []rune(step.text) {
				select {
				case <-ctx.Done():
					slog.Warn("[app] mockSendMessage: context cancelled during text streaming",
						"chatID", chatID,
						"stepIndex", stepIdx,
						"err", ctx.Err(),
						"fullTextLen", len(fullText),
					)
					em.RunError("cancelled")
					slog.Info("[app] mockSendMessage: emit RunError", "chatID", chatID, "reason", "cancelled")
					if EmitLegacyEvents {
						slog.Info("[app] mockSendMessage: emit legacy chat:stopped",
							"chatID", chatID, "fullTextLen", len(fullText))
						application.Get().Event.Emit("chat:stopped", fullText)
					}
					msg := Message{
						ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
						Role:    "assistant",
						Content: fullText,
						Time:    time.Now().Unix(),
					}
					slog.Info("[app] mockSendMessage: return cancelled message",
						"chatID", chatID, "msgID", msg.ID, "contentLen", len(msg.Content))
					return msg
				default:
				}
				piece := string(r)
				fullText += piece
				em.TextDelta(piece)
				slog.Debug("[app] mockSendMessage: emit TextDelta",
					"chatID", chatID, "delta", piece, "fullTextLen", len(fullText))
				if EmitLegacyEvents {
					application.Get().Event.Emit("chat:delta", piece)
					slog.Debug("[app] mockSendMessage: emit legacy chat:delta",
						"chatID", chatID, "delta", piece)
				}
				time.Sleep(10 * time.Millisecond)
			}
		}
	}

	// 收尾：闭合 TEXT_MESSAGE_END + RUN_FINISHED
	usage := &agui.Usage{
		InputTokens:  1024,
		OutputTokens: 512,
	}
	em.RunFinished(usage)
	if EmitLegacyEvents {
		application.Get().Event.Emit("chat:done", fullText)
	}
	// 持久化本轮对话，使侧边栏"项目 → 会话列表"可见
	c.persistTurn(chatID, "", fullText, int(usage.InputTokens), int(usage.OutputTokens))
	msg := Message{
		ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:    "assistant",
		Content: fullText,
		Time:    time.Now().Unix(),
	}
	slog.Info("[app] mockSendMessage: return final message",
		"chatID", chatID,
		"msgID", msg.ID,
		"role", msg.Role,
		"contentLen", len(msg.Content),
		"time", msg.Time,
	)
	return msg
}

// previewText returns a short, single-line preview of s for logging.
func previewText(s string, max int) string {
	// collapse newlines for readability in logs
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r == '\n' || r == '\r' {
			out = append(out, ' ')
		} else {
			out = append(out, r)
		}
	}
	if len(out) > max {
		return string(out[:max]) + "..."
	}
	return string(out)
}
