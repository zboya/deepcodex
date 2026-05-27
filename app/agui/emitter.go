// Package agui adapts deepcodex's harness streaming events to the
// AG-UI (Agent-User Interaction) protocol, then emits them to the frontend
// via Wails runtime events on a single channel ("agui:event").
//
// The frontend can decode these events with the official @ag-ui/core /
// @ag-ui/client packages, treating the Wails event stream as an alternative
// transport to the standard HTTP+SSE one.
package agui

import (
	"context"
	"encoding/json"
	"log/slog"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/zboya/deepcodex/agent/apitypes"
)

// Channel is the Wails event name used for all AG-UI events.
const Channel = "agui:event"

// emitFunc is the indirection used to send events to the Wails event bus.
// Production code keeps the default; tests override this var to capture events
// without needing a live Wails runtime.
//
// Why we DON'T use application.Get().Event.Emit here:
//   Wails v3's EventManager.Emit dispatches each event in a fresh goroutine
//   (see vendor/.../pkg/application/events.go:160 — `go func() {
//   e.dispatchEventToWindows(thisEvent) }()`). Two consecutive Emit calls
//   therefore race when reaching the main thread's ExecJS queue, which
//   reorders e.g. TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT and breaks
//   AG-UI's verifier ("No active text message found").
//
// Going through Window.DispatchWailsEvent instead funnels every event into
// ExecJS → InvokeSync on the same caller goroutine, so events arrive at the
// JS side in strict FIFO order. Frontend listeners on `Events.On("agui:event")`
// keep working unchanged because DispatchWailsEvent ultimately calls
// `window._wails.dispatchWailsEvent(...)` — the same hook the EventManager
// uses internally.
var emitFunc = func(name string, data ...any) bool {
	app := application.Get()
	if app == nil {
		return false
	}
	evt := &application.CustomEvent{Name: name}
	if len(data) == 1 {
		evt.Data = data[0]
	} else if len(data) > 1 {
		evt.Data = data
	}
	// Push synchronously to every open window. ExecJS internally schedules
	// onto the main thread via InvokeSync, so back-to-back emit calls from
	// the same goroutine are delivered to the webview in call order.
	for _, w := range app.Window.GetAll() {
		w.DispatchWailsEvent(evt)
	}
	return true
}

// Emitter translates a stream of harness StreamEvents into AG-UI events and
// pushes each one to the frontend through Wails runtime.EventsEmit.
//
// It maintains the minimum state required to pair START / END events:
//   - inText:    whether a TEXT_MESSAGE_* block is currently open
//   - msgID:     identifier of the active assistant message (set on first delta)
//   - openTools: tool call IDs whose ARGS stream is still open (keyed by index)
type Emitter struct {
	ctx      context.Context
	threadID string
	runID    string

	// Active assistant text message
	msgID  string
	inText bool

	// Active tool calls keyed by content_block index, so we can emit a
	// TOOL_CALL_END when the matching content_block_stop arrives.
	openTools map[int]string
}

// New constructs a new Emitter. threadID typically maps to the chatID /
// session ID on the deepcodex side; runID is auto-generated.
func New(ctx context.Context, threadID string) *Emitter {
	return &Emitter{
		ctx:       ctx,
		threadID:  threadID,
		runID:     aguievents.GenerateRunID(),
		openTools: make(map[int]string),
	}
}

// RunID returns the run identifier generated for this emitter (useful for tests).
func (e *Emitter) RunID() string { return e.runID }

// emit serializes an AG-UI event to JSON and pushes it on the Wails channel.
// We pre-marshal here (instead of letting Wails marshal) so the payload sent
// to the JS side already matches the official AG-UI JSON schema (camelCase
// field names defined on the SDK structs).
func (e *Emitter) emit(evt aguievents.Event) {
	data, err := evt.ToJSON()
	if err != nil {
		slog.Warn("[agui] failed to marshal event", "type", evt.Type(), "err", err)
		return
	}
	// Use json.RawMessage so Wails forwards the bytes as-is (no double encode).
	emitFunc(Channel, json.RawMessage(data))
}

// RunStarted emits RUN_STARTED. Must be called once at the beginning of a run.
func (e *Emitter) RunStarted() {
	e.emit(aguievents.NewRunStartedEvent(e.threadID, e.runID))
}

// TextDelta appends a chunk of assistant text. The first call lazily opens a
// TEXT_MESSAGE_START; subsequent calls reuse the same messageId.
func (e *Emitter) TextDelta(delta string) {
	if delta == "" {
		return
	}
	if !e.inText {
		e.msgID = aguievents.GenerateMessageID()
		role := "assistant"
		e.emit(aguievents.NewTextMessageStartEvent(
			e.msgID,
			aguievents.WithRole(role),
		))
		e.inText = true
	}
	e.emit(aguievents.NewTextMessageContentEvent(e.msgID, delta))
}

// closeText flushes a pending TEXT_MESSAGE_END if a text block is open.
// Tool / run boundary emitters call this so the protocol stays well-formed.
func (e *Emitter) closeText() {
	if !e.inText {
		return
	}
	e.emit(aguievents.NewTextMessageEndEvent(e.msgID))
	e.inText = false
	e.msgID = ""
}

// ToolCallStart opens a tool-call block, indexed by the harness content block
// index so we can match the END event later.
func (e *Emitter) ToolCallStart(blockIndex int, toolID, toolName string) {
	e.closeText()
	if toolID == "" {
		toolID = aguievents.GenerateToolCallID()
	}
	e.openTools[blockIndex] = toolID

	opts := []aguievents.ToolCallStartOption{}
	if e.msgID != "" {
		opts = append(opts, aguievents.WithParentMessageID(e.msgID))
	}
	e.emit(aguievents.NewToolCallStartEvent(toolID, toolName, opts...))
}

// ToolCallArgs streams a delta of tool call arguments (partial JSON).
func (e *Emitter) ToolCallArgs(blockIndex int, delta string) {
	if delta == "" {
		return
	}
	id, ok := e.openTools[blockIndex]
	if !ok {
		return
	}
	e.emit(aguievents.NewToolCallArgsEvent(id, delta))
}

// ToolCallEnd closes a tool-call block opened at the given index.
func (e *Emitter) ToolCallEnd(blockIndex int) {
	id, ok := e.openTools[blockIndex]
	if !ok {
		return
	}
	delete(e.openTools, blockIndex)
	e.emit(aguievents.NewToolCallEndEvent(id))
}

// ToolCallResult emits a TOOL_CALL_RESULT event with the tool's output.
func (e *Emitter) ToolCallResult(toolCallID, content string) {
	msgID := aguievents.GenerateMessageID()
	e.emit(aguievents.NewToolCallResultEvent(msgID, toolCallID, content))
}

// Custom emits a CUSTOM event (e.g. for token usage statistics).
func (e *Emitter) Custom(name string, value any) {
	e.emit(aguievents.NewCustomEvent(name, aguievents.WithValue(value)))
}

// Usage is a transport-agnostic snapshot of token consumption attached to
// RUN_FINISHED.Result. It mirrors the public counters of agent.UsageTracker
// without coupling agui to that package.
type Usage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
}

// RunFinished closes any open block and emits RUN_FINISHED.
// usage may be nil; when non-nil it is forwarded as the event Result.
func (e *Emitter) RunFinished(usage *Usage) {
	e.closeText()
	for idx := range e.openTools {
		e.ToolCallEnd(idx)
	}

	opts := []aguievents.RunFinishedOption{
		aguievents.WithSuccessOutcome(),
	}
	if usage != nil {
		opts = append(opts, aguievents.WithResult(map[string]any{
			"usage": usage,
		}))
	}
	e.emit(aguievents.NewRunFinishedEventWithOptions(e.threadID, e.runID, opts...))
}

// RunError closes any open block and emits RUN_ERROR with the given message.
func (e *Emitter) RunError(msg string) {
	e.closeText()
	e.emit(aguievents.NewRunErrorEvent(msg, aguievents.WithRunID(e.runID)))
}

// Translate consumes a single harness StreamEvent and emits the corresponding
// AG-UI events. It is safe to call repeatedly until the source channel closes;
// callers should follow the loop with RunFinished or RunError.
func (e *Emitter) Translate(ev apitypes.StreamEvent) {
	switch ev.Kind {
	case "content_block_start":
		if ev.ContentBlock == nil {
			return
		}
		switch ev.ContentBlock.Kind {
		case "text":
			// A new text block: ensure any previous one is closed, but DO NOT
			// preemptively open a new one — we only open on first non-empty
			// delta so empty placeholder blocks don't pollute the stream.
			e.closeText()
			if ev.ContentBlock.Text != "" {
				e.TextDelta(ev.ContentBlock.Text)
			}
		case "tool_use":
			e.ToolCallStart(ev.Index, ev.ContentBlock.ID, ev.ContentBlock.Name)
		}
	case "content_block_delta":
		if ev.BlockDelta == nil {
			return
		}
		switch ev.BlockDelta.Kind {
		case "text_delta":
			e.TextDelta(ev.BlockDelta.Text)
		case "input_json_delta":
			e.ToolCallArgs(ev.Index, ev.BlockDelta.PartialJSON)
		}
	case "content_block_stop":
		// If the index matches an open tool call, close it. Otherwise close
		// the active text block (harness emits one stop per block).
		if _, ok := e.openTools[ev.Index]; ok {
			e.ToolCallEnd(ev.Index)
		} else {
			e.closeText()
		}
	case "tool_result":
		if ev.ToolResult != nil {
			e.ToolCallResult(ev.ToolResult.ToolUseID, ev.ToolResult.Output)
		}
	}
}
