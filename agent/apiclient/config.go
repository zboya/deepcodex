package apiclient

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// configFileName 是 deepcodex 在用户家目录下持久化 LLM 提供商配置的相对路径。
//
// 完整路径为: ~/.deepcodex/providers.json
const (
	configDirName  = ".deepcodex"
	configFileName = "providers.json"
)

// ProviderConfig 描述一个用户配置的 LLM 提供商。
//
// 一个 ProviderConfig 同时承载:
//   - 鉴权信息 (APIKey / AuthToken)
//   - 接入信息 (BaseURL)
//   - 该 provider 下用户希望暴露的模型列表
//
// 该结构体既被持久化为 JSON, 也被 wails 绑定暴露给前端,
// 因此所有字段都使用 json tag, 并尽量保持与前端一致的 camelCase 风格。
type ProviderConfig struct {
	// Name 是用户为该 provider 起的唯一别名 (e.g. "my-openai").
	// 用于在配置文件中索引, 必填且全局唯一.
	Name string `json:"name"`

	// Kind 标识底层协议类型, 取值: "anthropic" | "openai" | "openai-compat" | "gemini" | "xai".
	// 决定使用哪个 Provider 实现.
	Kind string `json:"kind"`

	// BaseURL 是该 provider 的 API 接入地址 (可选, 留空使用对应 Kind 的默认值).
	BaseURL string `json:"baseUrl,omitempty"`

	// APIKey 是该 provider 的鉴权 key (明文存储, 仅本机使用).
	APIKey string `json:"apiKey,omitempty"`

	// AuthToken 仅 anthropic 使用, 对应 ANTHROPIC_AUTH_TOKEN.
	AuthToken string `json:"authToken,omitempty"`

	// Models 是该 provider 下用户已知/启用的模型 ID 列表.
	// 例如 ["gpt-5.4", "gpt-4o", "o3-mini"].
	Models []string `json:"models,omitempty"`

	// DefaultModel 是该 provider 下推荐使用的默认模型.
	DefaultModel string `json:"defaultModel,omitempty"`

	// Enabled 标识该 provider 是否启用; 为 false 时 ResolveProvider 不会自动选用它.
	Enabled bool `json:"enabled"`

	// CreatedAt / UpdatedAt 用于前端展示, 由保存逻辑自动维护.
	CreatedAt int64 `json:"createdAt,omitempty"`
	UpdatedAt int64 `json:"updatedAt,omitempty"`
}

// ProvidersConfig 是 ~/.deepcodex/providers.json 的根结构.
type ProvidersConfig struct {
	// Version 用于后续兼容升级.
	Version int `json:"version"`

	// ActiveProvider 是当前默认启用的 provider 名称.
	ActiveProvider string `json:"activeProvider,omitempty"`

	// Providers 是已配置的 provider 列表.
	Providers []ProviderConfig `json:"providers"`
}

var (
	// configMu 保护 providers.json 的并发读写.
	configMu sync.RWMutex
)

// ConfigDir 返回 ~/.deepcodex 目录的绝对路径.
//
// 若 HOME 不可用, 回退到当前工作目录下的 .deepcodex.
func ConfigDir() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return configDirName
	}
	return filepath.Join(home, configDirName)
}

// ConfigPath 返回 providers.json 的绝对路径.
func ConfigPath() string {
	return filepath.Join(ConfigDir(), configFileName)
}

// ensureConfigDir 确保 ~/.deepcodex 目录存在.
func ensureConfigDir() error {
	dir := ConfigDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create config dir %s: %w", dir, err)
	}
	return nil
}

// LoadProvidersConfig 读取 ~/.deepcodex/providers.json.
//
// 当文件不存在时返回一个空的 ProvidersConfig (而不是错误),
// 调用方可以无脑使用返回值再写回.
func LoadProvidersConfig() (*ProvidersConfig, error) {
	configMu.RLock()
	defer configMu.RUnlock()

	path := ConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &ProvidersConfig{Version: 1, Providers: []ProviderConfig{}}, nil
		}
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	cfg := &ProvidersConfig{}
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if cfg.Providers == nil {
		cfg.Providers = []ProviderConfig{}
	}
	return cfg, nil
}

// SaveProvidersConfig 把 ProvidersConfig 原子地写回 ~/.deepcodex/providers.json.
//
// 使用 写临时文件 + rename 的方式保证一致性, 避免半写状态.
func SaveProvidersConfig(cfg *ProvidersConfig) error {
	if cfg == nil {
		return fmt.Errorf("nil providers config")
	}
	configMu.Lock()
	defer configMu.Unlock()

	if err := ensureConfigDir(); err != nil {
		return err
	}
	if cfg.Version == 0 {
		cfg.Version = 1
	}

	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	path := ConfigPath()
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename tmp -> %s: %w", path, err)
	}
	return nil
}

// FindProviderConfig 按名称在已加载的配置中查找 provider.
// 第二个返回值为 false 表示未找到.
func (c *ProvidersConfig) FindProviderConfig(name string) (ProviderConfig, bool) {
	target := strings.ToLower(strings.TrimSpace(name))
	if c == nil || target == "" {
		return ProviderConfig{}, false
	}
	for _, p := range c.Providers {
		if strings.ToLower(p.Name) == target {
			return p, true
		}
	}
	return ProviderConfig{}, false
}

// UpsertProvider 新增或更新一个 provider 配置 (按 Name 唯一).
//
// 自动维护 CreatedAt / UpdatedAt 时间戳.
func (c *ProvidersConfig) UpsertProvider(p ProviderConfig) {
	now := time.Now().Unix()
	p.UpdatedAt = now
	for i := range c.Providers {
		if strings.EqualFold(c.Providers[i].Name, p.Name) {
			if p.CreatedAt == 0 {
				p.CreatedAt = c.Providers[i].CreatedAt
			}
			c.Providers[i] = p
			return
		}
	}
	if p.CreatedAt == 0 {
		p.CreatedAt = now
	}
	c.Providers = append(c.Providers, p)
}

// RemoveProvider 删除指定名称的 provider 配置, 返回是否真的删除了.
func (c *ProvidersConfig) RemoveProvider(name string) bool {
	target := strings.ToLower(strings.TrimSpace(name))
	for i, p := range c.Providers {
		if strings.ToLower(p.Name) == target {
			c.Providers = append(c.Providers[:i], c.Providers[i+1:]...)
			if strings.EqualFold(c.ActiveProvider, name) {
				c.ActiveProvider = ""
			}
			return true
		}
	}
	return false
}

// ResolveActiveProvider 返回当前 active 的 provider 配置.
// 若没有显式设置 ActiveProvider, 取第一个 Enabled=true 的 provider.
func (c *ProvidersConfig) ResolveActiveProvider() (ProviderConfig, bool) {
	if c == nil {
		return ProviderConfig{}, false
	}
	if c.ActiveProvider != "" {
		if p, ok := c.FindProviderConfig(c.ActiveProvider); ok {
			return p, true
		}
	}
	for _, p := range c.Providers {
		if p.Enabled {
			return p, true
		}
	}
	return ProviderConfig{}, false
}

// ToProviderKind 把字符串形式的 Kind 映射回内部 ProviderKind 枚举.
func (p ProviderConfig) ToProviderKind() ProviderKind {
	switch strings.ToLower(strings.TrimSpace(p.Kind)) {
	case "anthropic", "claude":
		return ProviderAnthropic
	case "openai", "gpt":
		return ProviderOpenAi
	case "gemini", "google":
		return ProviderGemini
	case "xai", "grok":
		return ProviderXai
	case "openrouter":
		return ProviderOpenRouter
	case "together":
		return ProviderTogether
	case "groq":
		return ProviderGroq
	case "mistral":
		return ProviderMistral
	case "deepseek":
		return ProviderDeepSeek
	case "azure":
		return ProviderAzure
	case "novita":
		return ProviderNovita
	case "codex":
		return ProviderCodex
	default:
		// "openai-compat" 和未知值统一走 OpenAI 兼容协议
		return ProviderOpenAi
	}
}
