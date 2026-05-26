package apiclient

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/zboya/deepcodex/agent/apitypes"
)

func TestMockProvider_SendMessage(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{
		ResponseText: "hi from mock",
		ModelName:    "mock-x",
	})

	if p.Kind() != ProviderMock {
		t.Fatalf("kind want ProviderMock, got %v", p.Kind())
	}

	resp, err := p.SendMessage(context.Background(), apitypes.MessageRequest{
		Model:    "any-model",
		Messages: []apitypes.InputMessage{apitypes.UserText("ping")},
	})
	if err != nil {
		t.Fatalf("SendMessage err: %v", err)
	}
	if len(resp.Content) == 0 || resp.Content[0].Text != "hi from mock" {
		t.Fatalf("unexpected content: %#v", resp.Content)
	}
	if resp.Model != "any-model" {
		t.Fatalf("model passthrough failed: %q", resp.Model)
	}
	if resp.StopReason != "end_turn" {
		t.Fatalf("stop_reason want end_turn, got %q", resp.StopReason)
	}
}

func TestMockProvider_SendMessage_Error(t *testing.T) {
	wantErr := errors.New("boom")
	p := NewMockProvider(MockProviderConfig{Err: wantErr})
	if _, err := p.SendMessage(context.Background(), apitypes.MessageRequest{}); !errors.Is(err, wantErr) {
		t.Fatalf("err want %v, got %v", wantErr, err)
	}
}

func TestMockProvider_StreamMessage(t *testing.T) {
	p := NewMockProvider(MockProviderConfig{
		ResponseText: "abcdefghij",
		ChunkSize:    3,
	})

	ch, err := p.StreamMessage(context.Background(), apitypes.MessageRequest{
		Messages: []apitypes.InputMessage{apitypes.UserText("hello")},
	})
	if err != nil {
		t.Fatalf("StreamMessage err: %v", err)
	}

	var (
		gotStart, gotStop bool
		buf               strings.Builder
	)
	for ev := range ch {
		switch ev.Kind {
		case "message_start":
			gotStart = true
		case "content_block_delta":
			if ev.BlockDelta != nil && ev.BlockDelta.Kind == "text_delta" {
				buf.WriteString(ev.BlockDelta.Text)
			}
		case "message_stop":
			gotStop = true
		}
	}
	if !gotStart || !gotStop {
		t.Fatalf("missing start/stop events: start=%v stop=%v", gotStart, gotStop)
	}
	if buf.String() != "abcdefghij" {
		t.Fatalf("reassembled text = %q", buf.String())
	}
}

func TestResolveProvider_MockSwitch(t *testing.T) {
	// 默认关闭, 显式断言初始状态.
	DisableMock()
	t.Cleanup(DisableMock)

	if IsMockEnabled() && strings.TrimSpace("") == "" {
		// 仅当用户没有同时设置 DEEPCODEX_MOCK 时才可严格断言.
		// 此处不强行 unset 环境变量, 只保证启用路径生效.
	}

	EnableMock()
	if !IsMockEnabled() {
		t.Fatal("EnableMock did not take effect")
	}

	custom := NewMockProvider(MockProviderConfig{ResponseText: "custom-mock"})
	SetMockProvider(custom)
	t.Cleanup(func() { SetMockProvider(nil) })

	prov, model, err := ResolveProvider("opus", "")
	if err != nil {
		t.Fatalf("ResolveProvider err: %v", err)
	}
	if prov.Kind() != ProviderMock {
		t.Fatalf("expected ProviderMock, got %v", prov.Kind())
	}
	if model == "" {
		t.Fatalf("model should not be empty")
	}

	// 关闭后, 同一调用不应再返回 MockProvider (除非环境变量强制开启,
	// 此时跳过断言以避免误报).
	DisableMock()
	if IsMockEnabled() {
		t.Skip("DEEPCODEX_MOCK env is set; skipping disable assertion")
	}
	prov2, _, err := ResolveProvider("opus", "test-key")
	if err != nil {
		// 没有凭据也可能正常解析失败, 这里只关心 kind.
		return
	}
	if prov2 != nil && prov2.Kind() == ProviderMock {
		t.Fatalf("DisableMock failed: still returning ProviderMock")
	}
}
