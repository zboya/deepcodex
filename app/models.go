package app

import (
	"fmt"
	"log/slog"

	"github.com/zboya/deepcodex/agent/apiclient"
)

type Models struct{}

// ===== LLM 提供商配置接口 =====
//
// 这些方法把 ~/.deepcodex/providers.json 暴露给前端 (Wails),
// 用于管理多 LLM 厂商配置 (api key, base url, 模型列表) 并查询模型.

// ListProviders 返回所有已配置的 LLM 提供商 (api key 已脱敏).
func (m *Models) ListProviders() []apiclient.ProviderConfig {
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
func (m *Models) GetProvidersConfig() *apiclient.ProvidersConfig {
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
func (m *Models) SaveProvider(p apiclient.ProviderConfig) error {
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
func (m *Models) DeleteProvider(name string) error {
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
func (m *Models) SetActiveProvider(name string) error {
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
func (m *Models) ListProviderModels(providerName string) []apiclient.ModelInfo {
	models, err := apiclient.ListModels(providerName)
	if err != nil {
		slog.Error(fmt.Sprintf("[app] list models for %q failed: %v", providerName, err))
		return []apiclient.ModelInfo{}
	}
	return models
}

// GetProvidersConfigPath 返回配置文件的绝对路径, 便于前端展示/打开.
func (m *Models) GetProvidersConfigPath() string {
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
