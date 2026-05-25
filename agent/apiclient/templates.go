package apiclient

import (
	"os"
	"strings"
)

// ProviderTemplate 描述一个内置 LLM 提供商模板.
//
// 模板代表「我们知道如何接入这个 provider, 这是它的官方默认值」, 但用户尚未
// 必须填写 API Key 才能真正启用. 启动时会将所有模板写入 providers.json,
// 用户可在前端模型设置界面补齐 API Key.
type ProviderTemplate struct {
	// Name 是该模板生成的 provider 默认名称, 同时作为 providers.json 中的 key.
	Name string `json:"name"`

	// Kind 标识底层协议类型, 取值与 ProviderConfig.Kind 一致.
	Kind string `json:"kind"`

	// DisplayName 是用于 UI 展示的友好名称.
	DisplayName string `json:"displayName"`

	// BaseURL 是该 provider 的默认 API 接入地址.
	BaseURL string `json:"baseUrl"`

	// Models 是该 provider 推荐暴露的模型 ID 列表.
	Models []string `json:"models"`

	// DefaultModel 是该 provider 推荐使用的默认模型.
	DefaultModel string `json:"defaultModel"`

	// AuthEnv 是该 provider 用于读取 API Key 的环境变量名 (可选).
	// 启动时若发现环境变量已设置, 会自动填入 ProviderConfig.APIKey.
	AuthEnv string `json:"authEnv,omitempty"`
}

// builtinProviderTemplates 列出所有内置支持的 LLM 提供商.
//
// 维护原则:
//   - Models 中的 ID 必须是该 provider 真实可用的模型完整 ID, 不是别名.
//   - DefaultModel 必须出现在 Models 中.
//   - 顺序决定前端 UI 中默认排序.
var builtinProviderTemplates = []ProviderTemplate{
	{
		Name:         "openai",
		Kind:         "openai",
		DisplayName:  "OpenAI",
		BaseURL:      "https://api.openai.com/v1",
		Models:       []string{"gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o", "gpt-4o-mini", "o3", "o3-mini", "o4-mini"},
		DefaultModel: "gpt-5.4",
		AuthEnv:      "OPENAI_API_KEY",
	},
	{
		Name:         "anthropic",
		Kind:         "anthropic",
		DisplayName:  "Anthropic (Claude)",
		BaseURL:      "",
		Models:       []string{"claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251213"},
		DefaultModel: "claude-sonnet-4-6",
		AuthEnv:      "ANTHROPIC_API_KEY",
	},
	{
		Name:         "gemini",
		Kind:         "gemini",
		DisplayName:  "Google Gemini",
		BaseURL:      "https://generativelanguage.googleapis.com/v1beta/openai",
		Models:       []string{"gemini-3.1-pro-preview", "gemini-3-flash", "gemini-2.5-pro"},
		DefaultModel: "gemini-3.1-pro-preview",
		AuthEnv:      "GEMINI_API_KEY",
	},
	{
		Name:         "xai",
		Kind:         "xai",
		DisplayName:  "xAI (Grok)",
		BaseURL:      "https://api.x.ai/v1",
		Models:       []string{"grok-4.20-beta", "grok-3", "grok-3-mini", "grok-2"},
		DefaultModel: "grok-4.20-beta",
		AuthEnv:      "XAI_API_KEY",
	},
	{
		Name:         "deepseek",
		Kind:         "deepseek",
		DisplayName:  "DeepSeek",
		BaseURL:      "https://api.deepseek.com/v1",
		Models:       []string{"deepseek-v4-pro", "deepseek-v4-flash"},
		DefaultModel: "deepseek-v4-pro",
		AuthEnv:      "DEEPSEEK_API_KEY",
	},
	{
		Name:         "mistral",
		Kind:         "mistral",
		DisplayName:  "Mistral",
		BaseURL:      "https://api.mistral.ai/v1",
		Models:       []string{"mistral-large-latest", "mistral-small-latest", "open-mistral-nemo", "codestral-latest", "pixtral-large-latest"},
		DefaultModel: "mistral-large-latest",
		AuthEnv:      "MISTRAL_API_KEY",
	},
	{
		Name:         "openrouter",
		Kind:         "openrouter",
		DisplayName:  "OpenRouter",
		BaseURL:      "https://openrouter.ai/api/v1",
		Models:       []string{"anthropic/claude-sonnet-4-6", "openai/gpt-5.4", "google/gemini-3.1-pro-preview", "meta-llama/llama-3.3-70b-instruct"},
		DefaultModel: "anthropic/claude-sonnet-4-6",
		AuthEnv:      "OPENROUTER_API_KEY",
	},
	{
		Name:         "together",
		Kind:         "together",
		DisplayName:  "Together AI",
		BaseURL:      "https://api.together.xyz/v1",
		Models:       []string{"meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"},
		DefaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
		AuthEnv:      "TOGETHER_API_KEY",
	},
	{
		Name:         "groq",
		Kind:         "groq",
		DisplayName:  "Groq",
		BaseURL:      "https://api.groq.com/openai/v1",
		Models:       []string{"llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"},
		DefaultModel: "llama-3.3-70b-versatile",
		AuthEnv:      "GROQ_API_KEY",
	},
	{
		Name:         "novita",
		Kind:         "novita",
		DisplayName:  "Novita AI",
		BaseURL:      "https://api.novita.ai/v3/openai",
		Models:       []string{"deepseek/deepseek_v3", "deepseek/deepseek-r1", "meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-72b-instruct"},
		DefaultModel: "deepseek/deepseek_v3",
		AuthEnv:      "NOVITA_API_KEY",
	},
	{
		Name:         "azure",
		Kind:         "azure",
		DisplayName:  "Azure OpenAI",
		BaseURL:      "",
		Models:       []string{},
		DefaultModel: "",
		AuthEnv:      "AZURE_OPENAI_API_KEY",
	},
}

// ListBuiltinProviderTemplates 返回所有内置 provider 模板的拷贝.
//
// 该方法被 wails 暴露给前端, 用于:
//   - 模型设置页展示「支持的 provider 全集」
//   - 模型下拉中即使无 API Key 也可显示但禁用选中
func ListBuiltinProviderTemplates() []ProviderTemplate {
	out := make([]ProviderTemplate, 0, len(builtinProviderTemplates))
	for _, t := range builtinProviderTemplates {
		// 深拷贝 Models 切片, 避免外部修改污染.
		models := make([]string, len(t.Models))
		copy(models, t.Models)
		t.Models = models
		out = append(out, t)
	}
	return out
}

// FindBuiltinTemplate 按名称查找内置 provider 模板.
func FindBuiltinTemplate(name string) (ProviderTemplate, bool) {
	target := strings.ToLower(strings.TrimSpace(name))
	for _, t := range builtinProviderTemplates {
		if strings.ToLower(t.Name) == target {
			models := make([]string, len(t.Models))
			copy(models, t.Models)
			t.Models = models
			return t, true
		}
	}
	return ProviderTemplate{}, false
}

// EnsureBuiltinProvidersInConfig 把所有内置 provider 模板写入到 providers.json.
//
// 行为细节:
//   - 已存在同名 provider: 不覆盖任何用户字段; 仅在某些字段为空时用模板补齐
//     (BaseURL 空 / Models 空 / DefaultModel 空), 同时尊重用户的 Enabled 选择.
//   - 不存在: 创建一个 Enabled=false 的占位 provider; 若环境变量 AuthEnv 已配置,
//     自动填入 APIKey 并 Enabled=true.
//   - 文件全部为空且本次注入产生了至少一个 Enabled=true 的模板: 自动设为 ActiveProvider.
//
// 该函数应在应用启动时调用一次, 失败仅返回错误, 由调用方决定是否记日志.
func EnsureBuiltinProvidersInConfig() (*ProvidersConfig, error) {
	cfg, err := LoadProvidersConfig()
	if err != nil {
		return nil, err
	}

	changed := false
	for _, tmpl := range builtinProviderTemplates {
		existing, ok := cfg.FindProviderConfig(tmpl.Name)
		if ok {
			// 仅做「补空」, 不覆盖用户字段.
			updated := existing
			touched := false
			if strings.TrimSpace(updated.BaseURL) == "" && tmpl.BaseURL != "" {
				updated.BaseURL = tmpl.BaseURL
				touched = true
			}
			if len(updated.Models) == 0 && len(tmpl.Models) > 0 {
				updated.Models = append([]string{}, tmpl.Models...)
				touched = true
			}
			if strings.TrimSpace(updated.DefaultModel) == "" && tmpl.DefaultModel != "" {
				updated.DefaultModel = tmpl.DefaultModel
				touched = true
			}
			if touched {
				cfg.UpsertProvider(updated)
				changed = true
			}
			continue
		}

		// 不存在 → 新建占位.
		pc := ProviderConfig{
			Name:         tmpl.Name,
			Kind:         tmpl.Kind,
			BaseURL:      tmpl.BaseURL,
			Models:       append([]string{}, tmpl.Models...),
			DefaultModel: tmpl.DefaultModel,
			Enabled:      false,
		}
		// 若环境变量里有 key, 自动填入并启用.
		if tmpl.AuthEnv != "" {
			if v := strings.TrimSpace(os.Getenv(tmpl.AuthEnv)); v != "" {
				pc.APIKey = v
				pc.Enabled = true
			}
		}
		cfg.UpsertProvider(pc)
		changed = true
	}

	// 没有任何 ActiveProvider 时, 选择第一个 Enabled=true 的作为活跃.
	if cfg.ActiveProvider == "" {
		for _, p := range cfg.Providers {
			if p.Enabled {
				cfg.ActiveProvider = p.Name
				changed = true
				break
			}
		}
	}

	if changed {
		if err := SaveProvidersConfig(cfg); err != nil {
			return nil, err
		}
	}
	return cfg, nil
}
