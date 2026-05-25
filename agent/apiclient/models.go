package apiclient

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/zboya/deepcodex/agent/apitypes"
)

// ModelInfo 描述一个模型条目, 是 ListModels 的返回元素.
//
// 该结构同时被 wails 绑定层使用, 字段以 camelCase 暴露给前端.
type ModelInfo struct {
	// ID 是模型的真实标识符, 如 "gpt-5.4", "claude-sonnet-4-6".
	ID string `json:"id"`

	// DisplayName 是用于 UI 展示的友好名称 (默认等于 ID).
	DisplayName string `json:"displayName,omitempty"`

	// Provider 是该模型所属的 provider 名称 (即 ProviderConfig.Name).
	Provider string `json:"provider,omitempty"`

	// Source 表示这一条来自哪里: "config" | "remote" | "alias".
	// 用于前端区分: 是用户配置的 / 远程接口拉取的 / 内置别名.
	Source string `json:"source,omitempty"`
}

// defaultBaseURLForKind 给定 Kind 时返回 OpenAI 兼容协议下的默认 base URL.
//
// 仅在 ProviderConfig.BaseURL 为空时使用.
func defaultBaseURLForKind(kind ProviderKind) string {
	switch kind {
	case ProviderAnthropic:
		// Anthropic 不走 OpenAI 兼容 /models 接口, 这里返回空表示不可用
		return ""
	case ProviderOpenAi:
		return "https://api.openai.com/v1"
	case ProviderGemini:
		return "https://generativelanguage.googleapis.com/v1beta/openai"
	case ProviderXai:
		return "https://api.x.ai/v1"
	case ProviderOpenRouter:
		return "https://openrouter.ai/api/v1"
	case ProviderTogether:
		return "https://api.together.xyz/v1"
	case ProviderGroq:
		return "https://api.groq.com/openai/v1"
	case ProviderMistral:
		return "https://api.mistral.ai/v1"
	case ProviderDeepSeek:
		return "https://api.deepseek.com/v1"
	case ProviderNovita:
		return "https://api.novita.ai/v3/openai"
	default:
		return ""
	}
}

// ListModels 返回某个已配置 provider 下的可用模型列表.
//
// 查询顺序:
//  1. 若 ProviderConfig.Models 非空, 直接返回 (Source=config);
//  2. 否则调用 OpenAI 兼容协议的 GET {baseUrl}/models 拉取 (Source=remote);
//  3. 远程失败则回退到内置 modelAliases 中匹配该 Kind 的别名 (Source=alias).
//
// providerName 为空时使用 ActiveProvider.
func ListModels(providerName string) ([]ModelInfo, error) {
	cfg, err := LoadProvidersConfig()
	if err != nil {
		return nil, err
	}

	var pc ProviderConfig
	var ok bool
	if strings.TrimSpace(providerName) == "" {
		pc, ok = cfg.ResolveActiveProvider()
	} else {
		pc, ok = cfg.FindProviderConfig(providerName)
	}
	if !ok {
		return nil, fmt.Errorf("provider %q not configured", providerName)
	}

	// 1. 优先使用配置中的 Models.
	if len(pc.Models) > 0 {
		out := make([]ModelInfo, 0, len(pc.Models))
		for _, m := range pc.Models {
			out = append(out, ModelInfo{
				ID:          m,
				DisplayName: m,
				Provider:    pc.Name,
				Source:      "config",
			})
		}
		return out, nil
	}

	// 2. 远程拉取.
	if remote, rerr := fetchRemoteModels(pc); rerr == nil && len(remote) > 0 {
		for i := range remote {
			remote[i].Provider = pc.Name
			remote[i].Source = "remote"
		}
		return remote, nil
	}

	// 3. 兜底: 从内置 aliases 中过滤出该 Kind 相关的模型 ID.
	return fallbackAliasModels(pc), nil
}

// ListConfiguredProviders 返回当前所有已配置的 provider 概要 (不含敏感字段).
//
// 注意: APIKey / AuthToken 字段会被置空, 避免暴露给前端 UI 后被无意外泄.
func ListConfiguredProviders() ([]ProviderConfig, error) {
	cfg, err := LoadProvidersConfig()
	if err != nil {
		return nil, err
	}
	out := make([]ProviderConfig, 0, len(cfg.Providers))
	for _, p := range cfg.Providers {
		p.APIKey = maskSecret(p.APIKey)
		p.AuthToken = maskSecret(p.AuthToken)
		out = append(out, p)
	}
	return out, nil
}

// maskSecret 把 key 脱敏成 "sk-***abcd" 形式, 仅保留尾 4 位.
func maskSecret(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 4 {
		return "****"
	}
	return "****" + s[len(s)-4:]
}

// fetchRemoteModels 通过 OpenAI 兼容协议的 GET {base}/models 拉取模型列表.
func fetchRemoteModels(pc ProviderConfig) ([]ModelInfo, error) {
	kind := pc.ToProviderKind()
	if kind == ProviderAnthropic {
		// Anthropic 没有 OpenAI 兼容的 /models, 这里直接走 fallback.
		return nil, fmt.Errorf("anthropic does not expose /models endpoint")
	}

	base := strings.TrimRight(pc.BaseURL, "/")
	if base == "" {
		base = strings.TrimRight(defaultBaseURLForKind(kind), "/")
	}
	if base == "" {
		return nil, fmt.Errorf("no base URL for provider %q", pc.Name)
	}

	url := base + "/models"
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// 复用现有鉴权逻辑.
	auth := authSourceFromConfig(pc)
	ApplyAuth(req, auth)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GET %s -> %d: %s", url, resp.StatusCode, truncate(string(body), 200))
	}

	// OpenAI 兼容格式: {"data":[{"id":"..."}, ...]}
	var payload struct {
		Data []struct {
			ID      string `json:"id"`
			OwnedBy string `json:"owned_by"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode /models: %w", err)
	}

	out := make([]ModelInfo, 0, len(payload.Data))
	for _, m := range payload.Data {
		if m.ID == "" {
			continue
		}
		out = append(out, ModelInfo{ID: m.ID, DisplayName: m.ID})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// authSourceFromConfig 从 ProviderConfig 构造 AuthSource (供 ApplyAuth 使用).
func authSourceFromConfig(pc ProviderConfig) apitypes.AuthSource {
	switch pc.ToProviderKind() {
	case ProviderAnthropic:
		switch {
		case pc.APIKey != "" && pc.AuthToken != "":
			return apitypes.AuthApiKeyAndBearer(pc.APIKey, pc.AuthToken)
		case pc.AuthToken != "":
			return apitypes.AuthBearer(pc.AuthToken)
		case pc.APIKey != "":
			return apitypes.AuthApiKey(pc.APIKey)
		}
	default:
		if pc.APIKey != "" {
			// OpenAI 兼容协议使用 Bearer.
			return apitypes.AuthBearer(pc.APIKey)
		}
	}
	return apitypes.AuthSource{}
}

// fallbackAliasModels 从内置 modelAliases 中过滤出与该 provider Kind 匹配的模型.
func fallbackAliasModels(pc ProviderConfig) []ModelInfo {
	kind := pc.ToProviderKind()
	seen := map[string]struct{}{}
	out := []ModelInfo{}
	for _, full := range modelAliases {
		if DetectProviderKind(full) != kind {
			continue
		}
		if _, dup := seen[full]; dup {
			continue
		}
		seen[full] = struct{}{}
		out = append(out, ModelInfo{
			ID:          full,
			DisplayName: full,
			Provider:    pc.Name,
			Source:      "alias",
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// truncate 把字符串裁剪到至多 n 个字符, 用于错误信息展示.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
