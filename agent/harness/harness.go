// Package harness provides a high-level API for creating and using the deepcodex agent.
// It encapsulates all initialization (provider resolution, tool registration, orchestrator, etc.)
// into a simple New() + Chat()/ChatStream() interface suitable for embedding in applications.
package harness

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/zboya/deepcodex/agent/agent"
	"github.com/zboya/deepcodex/agent/apiclient"
	"github.com/zboya/deepcodex/agent/apitypes"
	"github.com/zboya/deepcodex/agent/hooks"
	"github.com/zboya/deepcodex/agent/initdeep"
	"github.com/zboya/deepcodex/agent/orchestrator"
	"github.com/zboya/deepcodex/agent/plugins"
	"github.com/zboya/deepcodex/agent/repl"
	"github.com/zboya/deepcodex/agent/skills"
	"github.com/zboya/deepcodex/agent/toolimpl"
	"github.com/zboya/deepcodex/agent/tools"

	"github.com/zboya/deepcodex/agent/astgrep"
	"github.com/zboya/deepcodex/agent/data"
	"github.com/zboya/deepcodex/agent/hashline"
	"github.com/zboya/deepcodex/agent/mcpclient"
	"github.com/zboya/deepcodex/agent/tmux"
)

// Options configures the Harness.
type Options struct {
	// Model is the model name or alias (e.g. "sonnet", "gpt-4o", "gemini-pro").
	Model string

	// APIKey overrides the API key from environment variables.
	APIKey string

	// MaxTurns is the maximum number of agent loop iterations. Default: 30.
	MaxTurns int

	// MaxTokens is the maximum output tokens per request. Default: auto-detected per model.
	MaxTokens int

	// SystemPrompt overrides the default system prompt. If empty, uses the built-in prompt.
	SystemPrompt string

	// SkillName activates a specific skill (prepends skill system prompt).
	SkillName string

	// SkipPermissions if true, skips all permission prompts (full access mode).
	SkipPermissions bool

	// HashlineEnabled enables hashline mode for hash-anchored file I/O.
	HashlineEnabled bool

	// AllowedTools restricts to only these tools (whitelist).
	AllowedTools []string

	// DisallowedTools excludes these tools (blacklist).
	DisallowedTools []string

	// ToolCallback receives notifications before/after tool execution.
	// If nil, a no-op callback is used.
	ToolCallback agent.ToolCallback

	// Prompter handles permission prompts. If nil and SkipPermissions is false,
	// defaults to AllowAllPrompter.
	Prompter agent.PermissionPrompter

	// PluginsDir is the directory for plugins. Default: ".deepcodex/plugins".
	PluginsDir string

	// HooksConfigPath is the path to hooks.json. Default: ".deepcodex/hooks.json".
	HooksConfigPath string

	// MCPConfigPath is the path to mcp.json. Default: ".deepcodex/mcp.json".
	MCPConfigPath string

	// SkillsDir is the base directory for skills. Default: "" (uses default loader).
	SkillsDir string

	// NoProjectConfig skips loading GOCODE.md/CLAUDE.md.
	NoProjectConfig bool
}

// Harness wraps a fully-initialized agent runtime with a simple API.
type Harness struct {
	Runtime  *agent.ConversationRuntime
	Executor *agent.RegistryExecutor
	ToolImpl *toolimpl.Registry
	Model    string

	// internal cleanup functions
	cleanups []func()
}

// New creates a fully-initialized Harness. Call Close() when done to release resources.
func New(opts Options) (*Harness, error) {
	if opts.Model == "" {
		opts.Model = "deepseek"
	}
	if opts.MaxTurns <= 0 {
		opts.MaxTurns = 30
	}
	if opts.PluginsDir == "" {
		opts.PluginsDir = filepath.Join(".deepcodex", "plugins")
	}
	if opts.HooksConfigPath == "" {
		opts.HooksConfigPath = filepath.Join(".deepcodex", "hooks.json")
	}
	if opts.MCPConfigPath == "" {
		opts.MCPConfigPath = filepath.Join(".deepcodex", "mcp.json")
	}
	if opts.NoProjectConfig {
		repl.SkipProjectConfig = true
	}

	h := &Harness{}

	// 1. Resolve provider
	provider, resolvedModel, err := apiclient.ResolveProvider(opts.Model, opts.APIKey)
	if err != nil {
		return nil, fmt.Errorf("resolving provider: %w", err)
	}
	h.Model = resolvedModel

	// Auto-detect max tokens if not specified
	maxTokens := opts.MaxTokens
	if maxTokens <= 0 {
		maxTokens = apiclient.MaxTokensForProvider(provider.Kind(), resolvedModel)
	}

	// 2. Build FallbackProvider and ModelRouter
	fp := apiclient.NewFallbackProvider([]apiclient.FallbackEntry{
		{Model: resolvedModel, Provider: provider},
	}, nil)
	router := apiclient.NewModelRouter(map[apiclient.TaskCategory]*apiclient.FallbackProvider{
		apiclient.CategoryDeep:              fp,
		apiclient.CategoryQuick:             fp,
		apiclient.CategoryVisualEngineering: fp,
		apiclient.CategoryUltrabrain:        fp,
	})

	// 3. Tool registry
	toolReg, err := tools.NewToolRegistry(data.ToolsJSON)
	if err != nil {
		return nil, fmt.Errorf("loading tool registry: %w", err)
	}

	toolImpl := toolimpl.NewRegistry()

	// 4. Register advanced tools
	cleanup := wireAdvancedTools(toolImpl, opts.HashlineEnabled, opts.MCPConfigPath)
	h.cleanups = append(h.cleanups, cleanup)

	// 5. Create executor
	executor := agent.NewRegistryExecutor(toolImpl, toolReg)
	h.Executor = executor
	h.ToolImpl = toolImpl

	// 6. Orchestrator
	orch := orchestrator.NewOrchestrator(router, executor)
	toolImpl.Set("orchestrator_delegate", &orchestratorToolAdapter{orch: orch, toolName: "orchestrator_delegate"})
	toolImpl.Set("orchestrator_delegate_bg", &orchestratorToolAdapter{orch: orch, toolName: "orchestrator_delegate_bg"})

	// 7. Skills
	skillLoader := skills.NewSkillLoader(opts.SkillsDir)
	_, skillErrs := skillLoader.LoadAll()
	for _, e := range skillErrs {
			slog.Info(fmt.Sprintf("[harness/skills] %v", e))
	}

	// 8. Build system prompt
	systemPrompt := opts.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = repl.BuildSystemPrompt(executor.ListTools())
	}

	if opts.SkillName != "" {
		sk, ok := skillLoader.GetSkill(opts.SkillName)
		if !ok {
			h.Close()
			return nil, fmt.Errorf("unknown skill: %s", opts.SkillName)
		}
		systemPrompt = sk.SystemPrompt + "\n\n" + systemPrompt
	}

	if len(opts.AllowedTools) > 0 {
		systemPrompt += fmt.Sprintf("\n\n# Allowed Tools\nOnly use these tools: %s\n",
			joinStrings(opts.AllowedTools))
	}
	if len(opts.DisallowedTools) > 0 {
		systemPrompt += fmt.Sprintf("\n\n# Disallowed Tools\nDo NOT use these tools: %s\n",
			joinStrings(opts.DisallowedTools))
	}

	// 9. Permission mode
	permMode := agent.WorkspaceWrite
	if opts.SkipPermissions {
		permMode = agent.DangerFullAccess
	}

	// 10. Trusted tools store
	trustedStore := agent.NewTrustedToolStore("")
	_ = trustedStore.Load()

	// 11. Hooks
	pm := plugins.NewPluginManager(opts.PluginsDir)
	loadedPlugins, pluginErrs := pm.LoadAll()
	for _, e := range pluginErrs {
			slog.Info(fmt.Sprintf("[harness/plugins] %v", e))
	}
	hookRunner := plugins.NewPluginHookRunner(loadedPlugins)

	var hooksRunner agent.HookRunner = hookRunner
	if _, statErr := os.Stat(opts.HooksConfigPath); statErr == nil {
		shellRunner, shellErr := hooks.NewShellHookRunner(opts.HooksConfigPath, hookRunner)
		if shellErr != nil {
		slog.Error(fmt.Sprintf("[harness/hooks] failed to load shell hooks: %v", shellErr))
		} else {
			hooksRunner = shellRunner
		}
	}

	// 12. Create runtime
	rt := agent.NewConversationRuntime(agent.RuntimeOptions{
		Provider:      fp,
		Executor:      executor,
		Model:         resolvedModel,
		MaxTokens:     maxTokens,
		MaxIterations: opts.MaxTurns,
		SystemPrompt:  systemPrompt,
		PermMode:      permMode,
		Prompter:      opts.Prompter,
		Trusted:       trustedStore,
		ToolCb:        opts.ToolCallback,
		Hooks:         hooksRunner,
	})

	h.Runtime = rt
	return h, nil
}

// Chat sends a message and returns the full response (non-streaming).
func (h *Harness) Chat(ctx context.Context, msg string) (*apitypes.MessageResponse, error) {
	return h.Runtime.SendUserMessage(ctx, msg)
}

// ChatStream sends a message and returns a channel of streaming events.
func (h *Harness) ChatStream(ctx context.Context, msg string) (<-chan apitypes.StreamEvent, error) {
	return h.Runtime.StreamUserMessage(ctx, msg)
}

// ChatWithMessage sends a pre-built message (for multimodal input).
func (h *Harness) ChatWithMessage(ctx context.Context, msg apitypes.InputMessage) (*apitypes.MessageResponse, error) {
	return h.Runtime.SendWithMessage(ctx, msg)
}

// ChatStreamWithMessage sends a pre-built message with streaming.
func (h *Harness) ChatStreamWithMessage(ctx context.Context, msg apitypes.InputMessage) (<-chan apitypes.StreamEvent, error) {
	return h.Runtime.StreamWithMessage(ctx, msg)
}

// GetSession returns the current conversation session.
func (h *Harness) GetSession() []apitypes.InputMessage {
	return h.Runtime.GetSession()
}

// RestoreSession replaces the current session with a saved one.
func (h *Harness) RestoreSession(messages []apitypes.InputMessage) {
	h.Runtime.RestoreSession(messages)
}

// GetUsage returns the cumulative usage tracker.
func (h *Harness) GetUsage() agent.UsageTracker {
	return h.Runtime.GetUsage()
}

// Close releases all resources held by the Harness.
func (h *Harness) Close() {
	for _, fn := range h.cleanups {
		if fn != nil {
			fn()
		}
	}
	h.cleanups = nil
}

// --- internal helpers ---

func wireAdvancedTools(toolImpl *toolimpl.Registry, hashlineEnabled bool, mcpConfigPath string) func() {
	if hashlineEnabled {
		hashline.RegisterHashlineTools(toolImpl)
	}

	// Context-aware read (always enabled)
	initdeep.RegisterContextAwareRead(toolImpl)

	// ast-grep tool
	astgrep.RegisterAstGrepTool(toolImpl)

	// tmux tools
	tmuxMgr := tmux.NewManager()
	tmux.RegisterTmuxTools(toolImpl, tmuxMgr)

	// MCP client tools
	if _, statErr := os.Stat(mcpConfigPath); statErr == nil {
		mcpMgr, err := mcpclient.NewManager(mcpConfigPath)
		if err != nil {
		slog.Error(fmt.Sprintf("[harness/mcpclient] failed to create manager: %v", err))
			return tmuxMgr.KillAll
		}

		if connectErr := mcpMgr.ConnectAll(); connectErr != nil {
			slog.Error(fmt.Sprintf("[harness/mcpclient] %v", connectErr))
		}

		for _, t := range mcpMgr.ListTools() {
			toolName := t.Name
			toolImpl.Set(toolName, &mcpToolAdapter{mgr: mcpMgr, toolName: toolName})
		}

		return func() {
			tmuxMgr.KillAll()
			mcpMgr.Close()
		}
	}

	return tmuxMgr.KillAll
}

type mcpToolAdapter struct {
	mgr      *mcpclient.Manager
	toolName string
}

func (a *mcpToolAdapter) Execute(params map[string]interface{}) toolimpl.ToolResult {
	output, err := a.mgr.CallTool(a.toolName, params)
	if err != nil {
		return toolimpl.ToolResult{Success: false, Error: err.Error()}
	}
	return toolimpl.ToolResult{Success: true, Output: output}
}

type orchestratorToolAdapter struct {
	orch     *orchestrator.Orchestrator
	toolName string
}

func (a *orchestratorToolAdapter) Execute(params map[string]interface{}) toolimpl.ToolResult {
	result := a.orch.Execute(a.toolName, params)
	if result.IsError {
		return toolimpl.ToolResult{Success: false, Error: result.Output}
	}
	return toolimpl.ToolResult{Success: true, Output: result.Output}
}

func joinStrings(ss []string) string {
	result := ""
	for i, s := range ss {
		if i > 0 {
			result += ", "
		}
		result += s
	}
	return result
}
