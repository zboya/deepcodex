package main

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/zboya/deepcodex/agent/apiclient"
	"github.com/zboya/deepcodex/agent/harness"
)

// App struct
type App struct {
	ctx     context.Context
	harness *harness.Harness
	mu      sync.Mutex // protects concurrent sends
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize the AI harness
	h, err := harness.New(harness.Options{
		SkipPermissions: true,
		MaxTurns:        30,
	})
	if err != nil {
		slog.Error(fmt.Sprintf("[app] failed to initialize harness: %v", err))
		return
	}
	a.harness = h
	slog.Info(fmt.Sprintf("[app] harness initialized, model=%s", h.Model))
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	if a.harness != nil {
		a.harness.Close()
	}
}

// ===== Wails 绑定接口 =====

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

// ListProjects 列出工作区内的项目（占位）
func (a *App) ListProjects() []Project {
	return []Project{
		{ID: "p1", Name: "nanochat", Path: ""},
		{ID: "p2", Name: "chatgpt-demo", Path: ""},
		{ID: "p3", Name: "ansible", Path: ""},
	}
}

// ListChats 列出对话历史（占位）
func (a *App) ListChats() []ChatItem {
	return []ChatItem{}
}

// CreateChat 新建对话（占位）
func (a *App) CreateChat(title string) ChatItem {
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
func (a *App) SendMessage(chatID string, content string) Message {
	if a.harness == nil {
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: "[错误] AI 引擎未初始化",
			Time:    time.Now().Unix(),
		}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// 使用流式对话，通过 Wails Events 推送增量文本到前端
	ch, err := a.harness.ChatStream(context.Background(), content)
	if err != nil {
		errMsg := fmt.Sprintf("[错误] %v", err)
		runtime.EventsEmit(a.ctx, "chat:done", errMsg)
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: errMsg,
			Time:    time.Now().Unix(),
		}
	}

	var fullText string
	for ev := range ch {
		// 处理文本增量
		if ev.BlockDelta != nil && ev.BlockDelta.Kind == "text_delta" {
			fullText += ev.BlockDelta.Text
			runtime.EventsEmit(a.ctx, "chat:delta", ev.BlockDelta.Text)
		}
		// 处理新的文本块开始（可能携带初始文本）
		if ev.ContentBlock != nil && ev.ContentBlock.Kind == "text" && ev.ContentBlock.Text != "" {
			fullText += ev.ContentBlock.Text
			runtime.EventsEmit(a.ctx, "chat:delta", ev.ContentBlock.Text)
		}
	}

	runtime.EventsEmit(a.ctx, "chat:done", fullText)

	return Message{
		ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:    "assistant",
		Content: fullText,
		Time:    time.Now().Unix(),
	}
}

// SendMessageSync 非流式发送消息（备用接口）
func (a *App) SendMessageSync(chatID string, content string) Message {
	if a.harness == nil {
		return Message{
			ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
			Role:    "assistant",
			Content: "[错误] AI 引擎未初始化",
			Time:    time.Now().Unix(),
		}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	resp, err := a.harness.Chat(context.Background(), content)
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
func (a *App) GetUsage() map[string]interface{} {
	if a.harness == nil {
		return nil
	}
	usage := a.harness.GetUsage()
	return map[string]interface{}{
		"inputTokens":  usage.InputTokens,
		"outputTokens": usage.OutputTokens,
	}
}

// ===== LLM 提供商配置接口 =====
//
// 这些方法把 ~/.deepcodex/providers.json 暴露给前端 (Wails),
// 用于管理多 LLM 厂商配置 (api key, base url, 模型列表) 并查询模型.

// ListProviders 返回所有已配置的 LLM 提供商 (api key 已脱敏).
func (a *App) ListProviders() []apiclient.ProviderConfig {
	list, err := apiclient.ListConfiguredProviders()
	if err != nil {
		slog.Error(fmt.Sprintf("[app] list providers failed: %v", err))
		return []apiclient.ProviderConfig{}
	}
	return list
}

// GetProvidersConfig 返回完整的 providers.json 文件内容 (含 ActiveProvider).
//
// 注意: 该方法返回的 ProviderConfig 中 APIKey/AuthToken 被脱敏, 仅供展示.
func (a *App) GetProvidersConfig() *apiclient.ProvidersConfig {
	cfg, err := apiclient.LoadProvidersConfig()
	if err != nil {
		slog.Error(fmt.Sprintf("[app] load providers config failed: %v", err))
		return &apiclient.ProvidersConfig{Version: 1, Providers: []apiclient.ProviderConfig{}}
	}
	for i := range cfg.Providers {
		cfg.Providers[i].APIKey = maskKey(cfg.Providers[i].APIKey)
		cfg.Providers[i].AuthToken = maskKey(cfg.Providers[i].AuthToken)
	}
	return cfg
}

// SaveProvider 新增或更新一个 LLM 提供商配置.
//
// 当传入的 APIKey 为脱敏占位 (以 "****" 开头) 时, 保留文件中已有的 key,
// 这样前端可以安全地把 ListProviders 的结果直接回传, 不需要重新输入 key.
func (a *App) SaveProvider(p apiclient.ProviderConfig) error {
	cfg, err := apiclient.LoadProvidersConfig()
	if err != nil {
		return err
	}

	// 还原脱敏 key.
	if existing, ok := cfg.FindProviderConfig(p.Name); ok {
		if isMaskedKey(p.APIKey) {
			p.APIKey = existing.APIKey
		}
		if isMaskedKey(p.AuthToken) {
			p.AuthToken = existing.AuthToken
		}
	}

	cfg.UpsertProvider(p)
	return apiclient.SaveProvidersConfig(cfg)
}

// DeleteProvider 删除指定名称的 LLM 提供商配置.
func (a *App) DeleteProvider(name string) error {
	cfg, err := apiclient.LoadProvidersConfig()
	if err != nil {
		return err
	}
	if !cfg.RemoveProvider(name) {
		return fmt.Errorf("provider %q not found", name)
	}
	return apiclient.SaveProvidersConfig(cfg)
}

// SetActiveProvider 设置当前默认使用的 provider.
func (a *App) SetActiveProvider(name string) error {
	cfg, err := apiclient.LoadProvidersConfig()
	if err != nil {
		return err
	}
	if name != "" {
		if _, ok := cfg.FindProviderConfig(name); !ok {
			return fmt.Errorf("provider %q not found", name)
		}
	}
	cfg.ActiveProvider = name
	return apiclient.SaveProvidersConfig(cfg)
}

// ListProviderModels 返回某个 provider 下的可用模型列表.
//
// providerName 为空时使用 ActiveProvider.
// 解析顺序: 配置中的 Models -> 远程 /models 接口 -> 内置别名兜底.
func (a *App) ListProviderModels(providerName string) []apiclient.ModelInfo {
	models, err := apiclient.ListModels(providerName)
	if err != nil {
		slog.Error(fmt.Sprintf("[app] list models for %q failed: %v", providerName, err))
		return []apiclient.ModelInfo{}
	}
	return models
}

// GetProvidersConfigPath 返回配置文件的绝对路径, 便于前端展示/打开.
func (a *App) GetProvidersConfigPath() string {
	return apiclient.ConfigPath()
}

// maskKey 与 apiclient.maskSecret 行为一致, 在 main 包中复制一份避免导出.
func maskKey(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 4 {
		return "****"
	}
	return "****" + s[len(s)-4:]
}

// isMaskedKey 判断字符串是否是 maskKey 生成的占位符.
func isMaskedKey(s string) bool {
	return len(s) >= 4 && s[:4] == "****"
}
