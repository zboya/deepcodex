package agui

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/zboya/deepcodex/agent/apitypes"
)

// captured is a single Wails event captured during a test (decoded back to a
// generic map so we can assert on AG-UI fields by name).
type captured struct {
	Type      string                 `json:"type"`
	MessageID string                 `json:"messageId,omitempty"`
	Delta     string                 `json:"delta,omitempty"`
	Role      string                 `json:"role,omitempty"`
	ThreadID  string                 `json:"threadId,omitempty"`
	RunID     string                 `json:"runId,omitempty"`
	Outcome   map[string]interface{} `json:"outcome,omitempty"`
	Result    map[string]interface{} `json:"result,omitempty"`
	ToolCallID   string `json:"toolCallId,omitempty"`
	ToolCallName string `json:"toolCallName,omitempty"`
	Message string `json:"message,omitempty"`
}

// captureRuntime intercepts wruntime.EventsEmit calls without needing a real
// Wails runtime. Since the package-level EventsEmit looks up the context's
// "logger" key we can't easily monkey-patch it; instead we install a global
// hook by overriding the public function pointer for the duration of the test.
//
// The Wails v2 EventsEmit is a free function, not an interface, so we use a
// small package-internal indirection: tests set this var to capture events.
// The Emitter calls a shimEmit, which in production forwards to wruntime.
//
// Implementation note: we replace at the call-site in the emitter file by
// referencing a package var emitFunc. To keep the production path intact we
// only swap emitFunc inside tests via the helper below.

func withCapturedEmits(t *testing.T, fn func(emit *[]captured)) []captured {
	t.Helper()
	var (
		mu     sync.Mutex
		events []captured
	)
	prev := emitFunc
	emitFunc = func(_ context.Context, _ string, optionalData ...interface{}) {
		if len(optionalData) == 0 {
			return
		}
		raw, ok := optionalData[0].(json.RawMessage)
		if !ok {
			return
		}
		var c captured
		if err := json.Unmarshal(raw, &c); err != nil {
			t.Fatalf("decode captured event: %v", err)
		}
		mu.Lock()
		events = append(events, c)
		mu.Unlock()
	}
	t.Cleanup(func() { emitFunc = prev })
	fn(&events)
	return events
}

func TestEmitter_TextOnly(t *testing.T) {
	events := withCapturedEmits(t, func(*[]captured) {
		em := New(context.Background(), "thread-1")
		em.RunStarted()
		// First text block with two deltas
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_start", Index: 0,
			ContentBlock: &apitypes.OutputContentBlock{Kind: "text"},
		})
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_delta", Index: 0,
			BlockDelta: &apitypes.ContentBlockDelta{Kind: "text_delta", Text: "Hello "},
		})
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_delta", Index: 0,
			BlockDelta: &apitypes.ContentBlockDelta{Kind: "text_delta", Text: "world"},
		})
		em.Translate(apitypes.StreamEvent{Kind: "content_block_stop", Index: 0})
		em.RunFinished(&Usage{InputTokens: 10, OutputTokens: 5})
	})

	wantTypes := []string{
		"RUN_STARTED",
		"TEXT_MESSAGE_START",
		"TEXT_MESSAGE_CONTENT",
		"TEXT_MESSAGE_CONTENT",
		"TEXT_MESSAGE_END",
		"RUN_FINISHED",
	}
	if len(events) != len(wantTypes) {
		t.Fatalf("event count = %d, want %d (%v)", len(events), len(wantTypes), events)
	}
	for i, want := range wantTypes {
		if events[i].Type != want {
			t.Errorf("event[%d].Type = %s, want %s", i, events[i].Type, want)
		}
	}
	if events[1].Role != "assistant" {
		t.Errorf("text start role = %q, want assistant", events[1].Role)
	}
	if events[2].Delta != "Hello " || events[3].Delta != "world" {
		t.Errorf("deltas = %q %q", events[2].Delta, events[3].Delta)
	}
	if events[1].MessageID == "" || events[1].MessageID != events[4].MessageID {
		t.Errorf("messageId mismatch start=%q end=%q", events[1].MessageID, events[4].MessageID)
	}
	if events[5].ThreadID != "thread-1" {
		t.Errorf("RunFinished threadId = %q", events[5].ThreadID)
	}
	if events[5].Outcome["type"] != "success" {
		t.Errorf("RunFinished outcome = %v", events[5].Outcome)
	}
}

func TestEmitter_ToolCall(t *testing.T) {
	events := withCapturedEmits(t, func(*[]captured) {
		em := New(context.Background(), "thread-2")
		em.RunStarted()
		// text "Let me search."
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_start", Index: 0,
			ContentBlock: &apitypes.OutputContentBlock{Kind: "text"},
		})
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_delta", Index: 0,
			BlockDelta: &apitypes.ContentBlockDelta{Kind: "text_delta", Text: "Let me search."},
		})
		em.Translate(apitypes.StreamEvent{Kind: "content_block_stop", Index: 0})
		// tool_use block
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_start", Index: 1,
			ContentBlock: &apitypes.OutputContentBlock{Kind: "tool_use", ID: "tu_1", Name: "read_file"},
		})
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_delta", Index: 1,
			BlockDelta: &apitypes.ContentBlockDelta{Kind: "input_json_delta", PartialJSON: `{"path":`},
		})
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_delta", Index: 1,
			BlockDelta: &apitypes.ContentBlockDelta{Kind: "input_json_delta", PartialJSON: `"foo.go"}`},
		})
		em.Translate(apitypes.StreamEvent{Kind: "content_block_stop", Index: 1})
		em.RunFinished(nil)
	})

	wantTypes := []string{
		"RUN_STARTED",
		"TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END",
		"TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_ARGS", "TOOL_CALL_END",
		"RUN_FINISHED",
	}
	if len(events) != len(wantTypes) {
		t.Fatalf("event count = %d, want %d", len(events), len(wantTypes))
	}
	for i, want := range wantTypes {
		if events[i].Type != want {
			t.Errorf("event[%d].Type = %s, want %s", i, events[i].Type, want)
		}
	}
	if events[4].ToolCallID != "tu_1" || events[4].ToolCallName != "read_file" {
		t.Errorf("tool start = %+v", events[4])
	}
	if events[5].ToolCallID != "tu_1" || events[5].Delta != `{"path":` {
		t.Errorf("tool args[0] = %+v", events[5])
	}
	if events[7].ToolCallID != "tu_1" {
		t.Errorf("tool end id = %q", events[7].ToolCallID)
	}
}

func TestEmitter_RunError(t *testing.T) {
	events := withCapturedEmits(t, func(*[]captured) {
		em := New(context.Background(), "thread-3")
		em.RunStarted()
		em.Translate(apitypes.StreamEvent{
			Kind: "content_block_delta", Index: 0,
			BlockDelta: &apitypes.ContentBlockDelta{Kind: "text_delta", Text: "partial"},
		})
		em.RunError("boom")
	})

	wantTypes := []string{"RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_ERROR"}
	if len(events) != len(wantTypes) {
		t.Fatalf("event count = %d, want %d", len(events), len(wantTypes))
	}
	for i, want := range wantTypes {
		if events[i].Type != want {
			t.Errorf("event[%d].Type = %s, want %s", i, events[i].Type, want)
		}
	}
	if events[4].Message != "boom" {
		t.Errorf("error message = %q", events[4].Message)
	}
}

// silence the import linter when tests are skipped.
var _ = wruntime.EventsEmit
