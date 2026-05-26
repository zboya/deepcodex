package apiclient

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/zboya/deepcodex/agent/apitypes"
)

// =====================================================================
// Mock Provider
// ---------------------------------------------------------------------
// 这是一个用于本地测试 / 离线演示 / 单测的内置 LLM Provider:
//   - 不发起任何真实网络请求;
//   - 行为完全可由调用方通过 MockProviderConfig 自定义;
//   - 通过全局开关 MockEnabled 决定是否在 ResolveProvider 阶段短路接管.
//
// 典型使用方式:
//
//	// 测试启动时:
//	apiclient.EnableMock()
//	apiclient.SetMockProvider(apiclient.NewMockProvider(apiclient.MockProviderConfig{
//	    ResponseText: "Hello from mock!",
//	}))
//	// 测试结束:
//	apiclient.DisableMock()
//
// 也可通过环境变量 DEEPCODEX_MOCK=1 自动启用 (常用于集成/E2E 场景).
// =====================================================================

// mockEnabled 是控制 Mock Provider 是否生效的全局开关.
//
// 使用 atomic.Bool 保证多 goroutine 下的可见性, 任何位置都可以安全调用
// EnableMock / DisableMock / IsMockEnabled.
var mockEnabled atomic.Bool

// defaultMockProvider 是当用户未通过 SetMockProvider 注入自定义实例时,
// ResolveProvider 默认返回的 Mock 实例. 使用 sync.Once 延迟初始化.
var (
	defaultMockOnce     sync.Once
	defaultMockProvider *MockProvider

	customMockMu       sync.RWMutex
	customMockProvider *MockProvider
)

// EnableMock 打开全局 Mock 开关.
// 调用后, 后续 ResolveProvider 调用将直接返回 MockProvider, 不会执行任何
// 真实凭据解析或网络请求. 适合在测试 setup 中调用.
func EnableMock() {
	mockEnabled.Store(true)
}

// DisableMock 关闭全局 Mock 开关, 恢复默认 provider 解析行为.
func DisableMock() {
	mockEnabled.Store(false)
}

// IsMockEnabled 报告全局 Mock 开关当前是否打开.
//
// 同时识别环境变量 DEEPCODEX_MOCK ("1" / "true" / "yes" / "on", 大小写无关),
// 方便在不修改代码的前提下从命令行启用 mock 模式.
func IsMockEnabled() bool {
	if mockEnabled.Load() {
		return true
	}
	v := strings.ToLower(strings.TrimSpace(os.Getenv("DEEPCODEX_MOCK")))
	switch v {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// SetMockProvider 注入一个自定义 MockProvider 实例, 后续 ResolveProvider
// 在 mock 模式下会优先返回该实例. 传入 nil 等价于清除自定义实例.
func SetMockProvider(p *MockProvider) {
	customMockMu.Lock()
	defer customMockMu.Unlock()
	customMockProvider = p
}

// ActiveMockProvider 返回当前生效的 MockProvider 实例:
//   - 优先返回 SetMockProvider 注入的自定义实例;
//   - 否则返回带默认配置的单例.
func ActiveMockProvider() *MockProvider {
	customMockMu.RLock()
	p := customMockProvider
	customMockMu.RUnlock()
	if p != nil {
		return p
	}
	defaultMockOnce.Do(func() {
		defaultMockProvider = NewMockProvider(MockProviderConfig{
			ResponseText: `项目架构清晰，主要分为三层：
1. **Agent 层** — LLM 交互、工具调度、会话管理
2. **App 层** — Wails 绑定、AG-UI 事件推送、前后端桥接
3. **Frontend 层** — React UI、消息渲染、流式展示

功能特性：
- ✅ AG-UI 标准事件流（TEXT_MESSAGE + TOOL_CALL）
- ✅ 工具调用全生命周期（START → ARGS → END）
- ✅ 旧事件兼容（chat:delta / chat:done / chat:stopped）
- ✅ 支持随时取消

🔗 测试链接：[百度](https://baidu.com)
`,
			ChunkSize:       3,
			ChunkDelay:      10 * time.Millisecond,
			Err:             nil,
			SimulateToolUse: true,
			ToolName:        "mock_tool",
			ToolInput:       "{}",
		})
	})
	return defaultMockProvider
}

// MockProviderConfig 控制 MockProvider 的行为.
//
// 字段全部可选; 未设置时使用合理的默认值, 保证开箱即用.
type MockProviderConfig struct {
	// ResponseText 是 SendMessage 与 StreamMessage 输出的文本内容.
	// 默认 "[mock] hello from MockProvider".
	ResponseText string

	// ModelName 体现在响应 Model 字段中, 默认 "mock-model".
	ModelName string

	// ChunkSize 控制流式输出时每次 text_delta 携带的字符数, 默认 16.
	// <=0 时退化为整段一次性发送.
	ChunkSize int

	// ChunkDelay 是相邻流式 chunk 之间的间隔, 默认 0 (无延迟).
	// 调试/演示场景可设置为 ~50ms 以获得"逐字打印"效果.
	ChunkDelay time.Duration

	// Err 不为 nil 时, SendMessage 与 StreamMessage 会立即返回该错误,
	// 用于模拟上游故障路径.
	Err error

	// SimulateToolUse 为 true 时, 响应中追加一个 tool_use block, 用于
	// 测试 Agent loop 在收到 tool_use 时的行为.
	SimulateToolUse bool
	ToolName        string
	ToolInput       string // raw JSON, 默认 "{}"
}

// MockProvider 是 Provider 接口的内存实现, 不进行任何 I/O.
//
// 当 cfg.SimulateToolUse 为 true 时, 只在"首次"请求时返回 tool_use block
// (stop_reason="tool_use"), 之后所有请求均按普通文本结束 (stop_reason="end_turn").
// 这样既能演示一次完整的工具调用生命周期, 又不会让 Agent 主循环陷入死循环 ——
// Agent 在收到 tool_use 后会回喂 tool_result 再发起一次请求, 这一次 mock
// 就会返回 end_turn, loop 自然终止.
//
// 如需重置 "首次" 状态 (例如在测试用例之间复用同一个 MockProvider 实例),
// 可调用 ResetToolUse().
type MockProvider struct {
	cfg          MockProviderConfig
	toolUseFired atomic.Bool
}

// NewMockProvider 用给定配置构造一个 MockProvider.
// 任何留空的字段会被填充为默认值.
func NewMockProvider(cfg MockProviderConfig) *MockProvider {
	if cfg.ResponseText == "" {
		cfg.ResponseText = "[mock] hello from MockProvider"
	}
	if cfg.ModelName == "" {
		cfg.ModelName = "mock-model"
	}
	if cfg.ChunkSize == 0 {
		cfg.ChunkSize = 16
	}
	if cfg.SimulateToolUse && cfg.ToolName == "" {
		cfg.ToolName = "mock_tool"
	}
	if cfg.SimulateToolUse && cfg.ToolInput == "" {
		cfg.ToolInput = "{}"
	}
	return &MockProvider{cfg: cfg}
}

// Kind 实现 Provider 接口.
func (p *MockProvider) Kind() ProviderKind { return ProviderMock }

// ResetToolUse 把 "tool_use 是否已 fire 过" 的状态清零, 让下一次请求重新
// 触发一次工具调用模拟. 主要用于测试用例之间复用 MockProvider.
func (p *MockProvider) ResetToolUse() {
	p.toolUseFired.Store(false)
}

// shouldEmitToolUse 判断本次请求是否应该输出 tool_use block.
// 仅当 SimulateToolUse 开启 且 之前还没 fire 过时才返回 true.
// 通过 CAS 确保多 goroutine 下也只有一次会成功.
func (p *MockProvider) shouldEmitToolUse() bool {
	if !p.cfg.SimulateToolUse {
		return false
	}
	return p.toolUseFired.CompareAndSwap(false, true)
}

// SendMessage 返回一个固定结构的 MessageResponse.
// 若 cfg.Err 非空, 直接返回该错误.
func (p *MockProvider) SendMessage(ctx context.Context, req apitypes.MessageRequest) (*apitypes.MessageResponse, error) {
	if p.cfg.Err != nil {
		return nil, p.cfg.Err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	model := req.Model
	if model == "" {
		model = p.cfg.ModelName
	}

	emitToolUse := p.shouldEmitToolUse()

	blocks := []apitypes.OutputContentBlock{
		{Kind: "text", Text: p.cfg.ResponseText},
	}
	if emitToolUse {
		blocks = append(blocks, apitypes.OutputContentBlock{
			Kind:  "tool_use",
			ID:    fmt.Sprintf("mock_tool_%d", time.Now().UnixNano()),
			Name:  p.cfg.ToolName,
			Input: []byte(p.cfg.ToolInput),
		})
	}

	stop := "end_turn"
	if emitToolUse {
		stop = "tool_use"
	}

	return &apitypes.MessageResponse{
		ID:         fmt.Sprintf("msg_mock_%d", time.Now().UnixNano()),
		Type:       "message",
		Role:       "assistant",
		Content:    blocks,
		Model:      model,
		StopReason: stop,
		Usage: apitypes.Usage{
			InputTokens:  estimateTokens(req),
			OutputTokens: len(p.cfg.ResponseText) / 4,
		},
		RequestID: "mock-request-id",
	}, nil
}

// StreamMessage 返回一组与 Anthropic SSE 序列结构对齐的 StreamEvent:
//
//	message_start
//	content_block_start (text)
//	content_block_delta (text_delta) * N
//	content_block_stop
//	[ content_block_start (tool_use) + input_json_delta + content_block_stop ]
//	message_delta (stop_reason)
//	message_stop
//
// 这样上层 SSE 解析后的消费逻辑可以与真实 provider 保持一致.
func (p *MockProvider) StreamMessage(ctx context.Context, req apitypes.MessageRequest) (<-chan apitypes.StreamEvent, error) {
	if p.cfg.Err != nil {
		return nil, p.cfg.Err
	}

	model := req.Model
	if model == "" {
		model = p.cfg.ModelName
	}

	ch := make(chan apitypes.StreamEvent, 32)

	go func() {
		defer close(ch)

		send := func(ev apitypes.StreamEvent) bool {
			select {
			case ch <- ev:
				return true
			case <-ctx.Done():
				return false
			}
		}

		// message_start
		if !send(apitypes.StreamEvent{
			Kind: "message_start",
			Message: &apitypes.MessageResponse{
				ID:    fmt.Sprintf("msg_mock_%d", time.Now().UnixNano()),
				Type:  "message",
				Role:  "assistant",
				Model: model,
				Usage: apitypes.Usage{InputTokens: estimateTokens(req)},
			},
		}) {
			return
		}

		// 文本块
		if !send(apitypes.StreamEvent{
			Kind:         "content_block_start",
			Index:        0,
			ContentBlock: &apitypes.OutputContentBlock{Kind: "text"},
		}) {
			return
		}

		text := p.cfg.ResponseText
		size := p.cfg.ChunkSize
		if size <= 0 || size >= len(text) {
			if !send(apitypes.StreamEvent{
				Kind:       "content_block_delta",
				Index:      0,
				BlockDelta: &apitypes.ContentBlockDelta{Kind: "text_delta", Text: text},
			}) {
				return
			}
		} else {
			runes := []rune(text)
			for i := 0; i < len(runes); i += size {
				j := i + size
				if j > len(runes) {
					j = len(runes)
				}
				if !send(apitypes.StreamEvent{
					Kind:       "content_block_delta",
					Index:      0,
					BlockDelta: &apitypes.ContentBlockDelta{Kind: "text_delta", Text: string(runes[i:j])},
				}) {
					return
				}
				if p.cfg.ChunkDelay > 0 {
					select {
					case <-time.After(p.cfg.ChunkDelay):
					case <-ctx.Done():
						return
					}
				}
			}
		}

		if !send(apitypes.StreamEvent{Kind: "content_block_stop", Index: 0}) {
			return
		}

		// 可选的 tool_use 块 (仅在首次请求时 fire, 避免 Agent loop 死循环)
		stop := "end_turn"
		if p.shouldEmitToolUse() {
			stop = "tool_use"
			if !send(apitypes.StreamEvent{
				Kind:  "content_block_start",
				Index: 1,
				ContentBlock: &apitypes.OutputContentBlock{
					Kind: "tool_use",
					ID:   fmt.Sprintf("mock_tool_%d", time.Now().UnixNano()),
					Name: p.cfg.ToolName,
				},
			}) {
				return
			}
			if !send(apitypes.StreamEvent{
				Kind:       "content_block_delta",
				Index:      1,
				BlockDelta: &apitypes.ContentBlockDelta{Kind: "input_json_delta", PartialJSON: p.cfg.ToolInput},
			}) {
				return
			}
			if !send(apitypes.StreamEvent{Kind: "content_block_stop", Index: 1}) {
				return
			}
		}

		// message_delta + message_stop
		if !send(apitypes.StreamEvent{
			Kind:       "message_delta",
			Delta:      &apitypes.DeltaPayload{StopReason: stop},
			DeltaUsage: &apitypes.Usage{OutputTokens: len(text) / 4},
		}) {
			return
		}
		_ = send(apitypes.StreamEvent{Kind: "message_stop"})
	}()

	return ch, nil
}

// estimateTokens 给 Usage 字段一个粗略估算, 仅用于 mock 场景.
func estimateTokens(req apitypes.MessageRequest) int {
	total := len(req.System) / 4
	for _, m := range req.Messages {
		for _, b := range m.Content {
			total += len(b.Text) / 4
		}
	}
	return total
}
