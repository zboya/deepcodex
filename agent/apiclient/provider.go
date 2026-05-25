package apiclient

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/zboya/deepcodex/agent/apitypes"
)

// Provider is the core abstraction for LLM API communication.
type Provider interface {
	// SendMessage sends a non-streaming request and returns the full response.
	SendMessage(ctx context.Context, req apitypes.MessageRequest) (*apitypes.MessageResponse, error)

	// StreamMessage sends a streaming request and returns a channel of events.
	StreamMessage(ctx context.Context, req apitypes.MessageRequest) (<-chan apitypes.StreamEvent, error)

	// Kind returns the provider type.
	Kind() ProviderKind
}

// ResolveProvider selects a Provider based on model name and available credentials.
// Supports 4 native providers + 7 proxy services via OpenAI-compatible shim.
//
// 解析顺序:
//  1. CLI/参数显式 model + apiKeyFlag;
//  2. 环境变量 (OPENAI_BASE_URL / *_API_KEY 等), 保持原有行为兼容;
//  3. ~/.deepcodex/providers.json 中已配置的 provider (按 Name 或 model 推断匹配);
//  4. 失败则返回 NewMissingCredentials.
func ResolveProvider(model string, apiKeyFlag string) (Provider, string, error) {
	resolvedModel := ResolveModelAlias(model)

	// 0. 优先尝试用文件配置中的 provider, 仅当用户在 ~/.deepcodex/providers.json
	//    里显式配置, 且当前进程没有任何主动的环境变量覆盖时才采用,
	//    避免破坏已有 env-based 集成.
	if !hasAnyEnvCredentials() {
		if p, m, ok := resolveProviderFromConfig(model, apiKeyFlag); ok {
			return p, m, nil
		}
	}

	// If OPENAI_BASE_URL is set, always use OpenAI-compatible provider with that URL
	// This enables Ollama, LM Studio, and any local/custom endpoint.
	if baseURL := os.Getenv("OPENAI_BASE_URL"); baseURL != "" {
		auth, err := ResolveAuthSource(ProviderOpenAi, apiKeyFlag)
		if err != nil {
			// For local models, auth may not be required
			auth = apitypes.AuthSource{}
		}
		return NewOpenAiCompatProvider(OpenAiCompatConfig{
			ProviderName: "OpenAI-Compatible",
			BaseURLEnv:   "OPENAI_BASE_URL",
			DefaultBase:  "https://api.openai.com/v1",
		}, auth), resolvedModel, nil
	}

	kind := DetectProviderKind(resolvedModel)

	// Codex backend: load auth from ~/.codex/auth.json
	if kind == ProviderCodex {
		auth := resolveCodexAuth(apiKeyFlag)
		return NewOpenAiCompatProvider(OpenAiCompatConfig{
			ProviderName: "Codex",
			BaseURLEnv:   "CODEX_BASE_URL",
			DefaultBase:  "https://api.openai.com/v1",
		}, auth), resolvedModel, nil
	}

	// Proxy providers: OpenRouter, Together, Groq, Mistral, DeepSeek, Azure
	if cfg, ok := proxyProviderConfigs[kind]; ok {
		auth, err := resolveEnvAuth(cfg.AuthEnv, cfg.Name, cfg.AuthEnv)
		if err != nil {
			// Try with CLI flag
			if apiKeyFlag != "" {
				auth = apitypes.AuthApiKey(apiKeyFlag)
			} else {
				return nil, resolvedModel, err
			}
		}
		return NewOpenAiCompatProvider(OpenAiCompatConfig{
			ProviderName: cfg.Name,
			BaseURLEnv:   cfg.BaseEnv,
			DefaultBase:  cfg.Default,
		}, auth), resolvedModel, nil
	}

	// Native providers
	auth, err := ResolveAuthSource(kind, apiKeyFlag)
	if err != nil {
		return nil, resolvedModel, err
	}

	switch kind {
	case ProviderXai:
		return NewOpenAiCompatProvider(OpenAiCompatConfig{
			ProviderName: "xAI",
			BaseURLEnv:   "XAI_BASE_URL",
			DefaultBase:  "https://api.x.ai/v1",
		}, auth), resolvedModel, nil
	case ProviderOpenAi:
		return NewOpenAiCompatProvider(OpenAiCompatConfig{
			ProviderName: "OpenAI",
			BaseURLEnv:   "OPENAI_BASE_URL",
			DefaultBase:  "https://api.openai.com/v1",
		}, auth), resolvedModel, nil
	case ProviderGemini:
		return NewOpenAiCompatProvider(OpenAiCompatConfig{
			ProviderName: "Google Gemini",
			BaseURLEnv:   "GEMINI_BASE_URL",
			DefaultBase:  "https://generativelanguage.googleapis.com/v1beta/openai",
		}, auth), resolvedModel, nil
	default:
		return NewAnthropicProvider(auth), resolvedModel, nil
	}
}

// resolveCodexAuth loads Codex auth from ~/.codex/auth.json or falls back to OPENAI_API_KEY.
func resolveCodexAuth(apiKeyFlag string) apitypes.AuthSource {
	if apiKeyFlag != "" {
		return apitypes.AuthApiKey(apiKeyFlag)
	}
	// Try ~/.codex/auth.json
	home, _ := os.UserHomeDir()
	codexPath := filepath.Join(home, ".codex", "auth.json")
	if data, err := os.ReadFile(codexPath); err == nil {
		var codexAuth struct {
			APIKey string `json:"api_key"`
			Token  string `json:"token"`
		}
		if json.Unmarshal(data, &codexAuth) == nil {
			if codexAuth.APIKey != "" {
				return apitypes.AuthApiKey(codexAuth.APIKey)
			}
			if codexAuth.Token != "" {
				return apitypes.AuthBearer(codexAuth.Token)
			}
		}
	}
	// Fall back to OPENAI_API_KEY
	if key := readEnvNonEmpty("OPENAI_API_KEY"); key != "" {
		return apitypes.AuthApiKey(key)
	}
	return apitypes.AuthSource{}
}

// hasAnyEnvCredentials 判断当前环境中是否存在任意一个 LLM 鉴权环境变量.
//
// 用于决定 ResolveProvider 是否应该跳过 ~/.deepcodex/providers.json 文件配置:
// 当用户已经设置了环境变量时, 优先沿用原有 env-based 行为, 不破坏现有部署.
func hasAnyEnvCredentials() bool {
	envs := []string{
		"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
		"OPENAI_API_KEY", "OPENAI_BASE_URL",
		"GEMINI_API_KEY", "GOOGLE_API_KEY",
		"XAI_API_KEY",
		"OPENROUTER_API_KEY", "TOGETHER_API_KEY", "GROQ_API_KEY",
		"MISTRAL_API_KEY", "DEEPSEEK_API_KEY", "AZURE_OPENAI_API_KEY",
		"NOVITA_API_KEY",
	}
	for _, k := range envs {
		if envNonEmpty(k) {
			return true
		}
	}
	return false
}

// resolveProviderFromConfig 从 ~/.deepcodex/providers.json 中查找匹配的 ProviderConfig
// 并构造对应的 Provider 实例.
//
// 匹配规则:
//   - 若 model 与某个 ProviderConfig.Name 完全匹配 (大小写无关) -> 选该 provider;
//   - 否则若某个 ProviderConfig.Models 中包含该 model -> 选该 provider;
//   - 否则使用 ActiveProvider; 若没有则取第一个 Enabled=true 的 provider.
//
// resolved model 取值:
//   - 当 model 命中 Name 时, 使用 ProviderConfig.DefaultModel (若有);
//   - 否则使用入参 model (经过 alias 展开).
func resolveProviderFromConfig(model, apiKeyFlag string) (Provider, string, bool) {
	cfg, err := LoadProvidersConfig()
	if err != nil || cfg == nil || len(cfg.Providers) == 0 {
		return nil, "", false
	}

	resolvedModel := ResolveModelAlias(model)
	var pc ProviderConfig
	var found bool

	// 1. 按 model 等于 ProviderConfig.Name 匹配 (允许前端用 provider 名字当 model 传入).
	if pc, found = cfg.FindProviderConfig(model); found {
		if pc.DefaultModel != "" {
			resolvedModel = ResolveModelAlias(pc.DefaultModel)
		}
	}

	// 2. 按 ProviderConfig.Models 包含 model 匹配.
	if !found {
		for _, p := range cfg.Providers {
			if !p.Enabled {
				continue
			}
			for _, m := range p.Models {
				if strings.EqualFold(m, model) || strings.EqualFold(m, resolvedModel) {
					pc = p
					found = true
					break
				}
			}
			if found {
				break
			}
		}
	}

	// 3. 回退到 active provider.
	if !found {
		pc, found = cfg.ResolveActiveProvider()
		if found && pc.DefaultModel != "" && model == "" {
			resolvedModel = ResolveModelAlias(pc.DefaultModel)
		}
	}
	if !found || !pc.Enabled {
		return nil, "", false
	}

	auth := authSourceFromConfig(pc)
	if apiKeyFlag != "" {
		auth = apitypes.AuthApiKey(apiKeyFlag)
	}

	kind := pc.ToProviderKind()
	if kind == ProviderAnthropic {
		return NewAnthropicProvider(auth), resolvedModel, true
	}

	// 其余 Kind 统一走 OpenAI 兼容协议; BaseURL 优先使用配置中的值.
	baseURL := pc.BaseURL
	if baseURL == "" {
		baseURL = defaultBaseURLForKind(kind)
	}
	return NewOpenAiCompatProvider(OpenAiCompatConfig{
		ProviderName: pc.Name,
		// BaseURLEnv 留空, 让 NewOpenAiCompatProvider 直接使用 DefaultBase.
		BaseURLEnv:  "",
		DefaultBase: baseURL,
	}, auth), resolvedModel, true
}
