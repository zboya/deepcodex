package main

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/zboya/deepcodex/agent/apiclient"
	"github.com/zboya/deepcodex/agent/harness"
	"github.com/zboya/deepcodex/agent/session"
	"github.com/zboya/deepcodex/app"
)

// App struct
type App struct {
	ctx context.Context

	*app.Models
	*app.Projects

	// 全局共享的默认 Chat（无项目时使用）
	defaultChat    *app.Chat
	defaultHarness *harness.Harness

	// 每个项目对应独立的 Chat 实例（key = projectID）
	projectChats map[string]*app.Chat
	chatMu       sync.RWMutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		Models:       &app.Models{},
		Projects:     app.NewProjects(),
		projectChats: make(map[string]*app.Chat),
	}
}

// ServiceStartup is called by Wails v3 when the bound service starts.
func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	a.ctx = ctx

	// 启动期写入内置 provider 模板, 让用户在模型设置页可看到全部支持的 provider.
	// 已存在的 provider 不会被覆盖, 仅补齐缺失字段.
	if _, err := apiclient.EnsureBuiltinProvidersInConfig(); err != nil {
		slog.Warn(fmt.Sprintf("[app] ensure default providers failed: %v", err))
	}

	// Initialize the default AI harness (no project)
	h, err := harness.New(harness.Options{
		SkipPermissions: true,
		MaxTurns:        30,
	})
	if err != nil {
		slog.Error(fmt.Sprintf("[app] failed to initialize default harness: %v", err))
		return err
	}
	a.defaultHarness = h
	a.defaultChat = app.NewChat(ctx, h)
	slog.Info(fmt.Sprintf("[app] default harness initialized, model=%s", h.Model))
	return nil
}

// ServiceShutdown is called by Wails v3 when the bound service shuts down.
func (a *App) ServiceShutdown() error {
	if a.defaultChat != nil {
		a.defaultChat.Close()
	}
	a.chatMu.Lock()
	for _, c := range a.projectChats {
		c.Close()
	}
	a.chatMu.Unlock()
	return nil
}

// ─── 项目相关接口（覆盖/扩展 Projects 方法）─────────────────────────────────

// SelectDirectory 打开原生目录选择对话框，返回用户选择的路径
func (a *App) SelectDirectory() (string, error) {
	return application.Get().Dialog.OpenFile().
		SetTitle("选择项目目录").
		CanChooseFiles(false).
		CanChooseDirectories(true).
		CanCreateDirectories(true).
		PromptForSingleSelection()
}

// SelectImageFiles 打开原生文件选择对话框，允许用户挑选一张或多张图片。
// 返回所选图片的绝对路径列表；用户取消时返回空数组。
// 前端在输入框输入 `@` 时会触发此对话框，把所选路径以 `@<path>` 形式回填到输入文本中。
func (a *App) SelectImageFiles() ([]string, error) {
	dlg := application.Get().Dialog.OpenFile().
		SetTitle("选择图片").
		CanChooseFiles(true).
		CanChooseDirectories(false).
		AddFilter("图片", "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp")

	paths, err := dlg.PromptForMultipleSelection()
	if err != nil {
		return nil, err
	}
	if paths == nil {
		return []string{}, nil
	}
	return paths, nil
}

// ─── Chat 相关接口（代理到对应项目或默认 Chat）────────────────────────────────

// getChat 返回指定 projectID 对应的 Chat；projectID 为空时返回默认 Chat
func (a *App) getChat(projectID string) *app.Chat {
	if projectID == "" {
		return a.defaultChat
	}

	a.chatMu.RLock()
	c, ok := a.projectChats[projectID]
	a.chatMu.RUnlock()
	if ok {
		return c
	}

	// 懒初始化：第一次使用时创建
	return a.initProjectChat(projectID)
}

// initProjectChat 为项目懒初始化独立的 Harness + Chat
func (a *App) initProjectChat(projectID string) *app.Chat {
	a.chatMu.Lock()
	defer a.chatMu.Unlock()

	// double-check
	if c, ok := a.projectChats[projectID]; ok {
		return c
	}

	proj, err := a.Projects.GetProject(projectID)
	if err != nil {
		slog.Error(fmt.Sprintf("[app] project not found: %s, %v", projectID, err))
		return a.defaultChat
	}

	h, err := harness.New(harness.Options{
		WorkDir:         proj.Path,
		SkipPermissions: true,
		MaxTurns:        30,
	})
	if err != nil {
		slog.Error(fmt.Sprintf("[app] failed to initialize harness for project %s: %v", proj.Name, err))
		return a.defaultChat
	}

	// 会话存储在项目目录下的 .port_sessions
	sessDir := filepath.Join(proj.Path, ".port_sessions")
	c := app.NewChatWithWorkDir(a.ctx, h, proj.Path, sessDir)
	a.projectChats[projectID] = c
	slog.Info(fmt.Sprintf("[app] project harness initialized: %s, workDir=%s", proj.Name, proj.Path))
	return c
}

// ListChats 获取指定项目的会话列表
func (a *App) ListChats(projectID string) []app.ChatItem {
	return a.getChat(projectID).ListChats()
}

// GetSessionMessages 获取一个会话的历史消息
func (a *App) GetSessionMessages(projectID string, sessionID string) []app.Message {
	c := a.getChat(projectID)
	return c.GetSessionMessages(sessionID)
}

// SendMessage 发送消息（流式）
// imagePaths 为可选的图片路径列表（前端通过 SelectImageFiles 选择得到），非空时走多模态通道。
func (a *App) SendMessage(projectID string, chatID string, content string, imagePaths []string, opts app.SendOptions) app.Message {
	// Check if model has changed and reinitialize harness if needed
	a.ensureActiveModel(projectID)
	return a.getChat(projectID).SendMessage(chatID, content, imagePaths, opts)
}

// StopMessage 中止当前对话
func (a *App) StopMessage(projectID string) {
	a.getChat(projectID).StopMessage()
}

// CreateChat 新建对话
func (a *App) CreateChat(projectID string, title string) app.ChatItem {
	return a.getChat(projectID).CreateChat(title)
}

// GetUsage 获取用量
func (a *App) GetUsage(projectID string) map[string]interface{} {
	return a.getChat(projectID).GetUsage()
}

// Close 关闭（前端调用）
func (a *App) Close() {
	_ = a.ServiceShutdown()
}

// ─── MCP & Skills 接口 ──────────────────────────────────────────────────────

// ensureActiveModel checks if the active provider/model in config differs from
// the current harness's model. If so, it reinitializes the harness.
func (a *App) ensureActiveModel(projectID string) {
	// Resolve what the user currently has selected
	cfg, err := apiclient.LoadProvidersConfig()
	if err != nil || cfg == nil {
		return
	}

	var wantModel string
	if pc, ok := cfg.ResolveActiveProvider(); ok && pc.DefaultModel != "" {
		wantModel = pc.DefaultModel
	}
	if wantModel == "" {
		return
	}

	if projectID == "" {
		// Default harness path
		if a.defaultHarness != nil && a.defaultHarness.Model == wantModel {
			return
		}
		slog.Info(fmt.Sprintf("[app] model changed, reinitializing default harness: %s -> %s",
			a.defaultHarness.Model, wantModel))
		h, err := harness.New(harness.Options{
			Model:           wantModel,
			SkipPermissions: true,
			MaxTurns:        30,
		})
		if err != nil {
			slog.Error(fmt.Sprintf("[app] failed to reinitialize default harness: %v", err))
			return
		}
		if a.defaultHarness != nil {
			a.defaultHarness.Close()
		}
		a.defaultHarness = h
		a.defaultChat = app.NewChat(a.ctx, h)
		slog.Info(fmt.Sprintf("[app] default harness reinitialized, model=%s", h.Model))
	} else {
		// Project harness path
		a.chatMu.RLock()
		c, ok := a.projectChats[projectID]
		a.chatMu.RUnlock()
		if !ok {
			return // will be lazily created with correct model
		}
		_ = c // project chats use their own harness; for now skip dynamic switching
	}
}

// ListMCPServers 返回默认 harness 中已配置的 MCP 服务器列表。
func (a *App) ListMCPServers() []app.MCPServerItem {
	if a.defaultHarness == nil {
		return []app.MCPServerItem{}
	}
	mcp := app.NewMCP(a.defaultHarness)
	return mcp.List()
}

// ListSkills 返回所有可用的 Skills 列表（内置 + 用户自定义）。
func (a *App) ListSkills() []app.SkillItem {
	if a.defaultHarness == nil {
		return []app.SkillItem{}
	}
	sk := app.NewSkills(a.defaultHarness)
	return sk.List()
}

// ─── session store 直接查询（不依赖 harness）────────────────────────────────

// ListSessionsForProject 直接从磁盘读取项目的会话列表（无需 Harness 初始化）
func (a *App) ListSessionsForProject(projectID string) []app.ChatItem {
	proj, err := a.Projects.GetProject(projectID)
	if err != nil {
		return []app.ChatItem{}
	}
	sessDir := filepath.Join(proj.Path, ".port_sessions")
	store := session.NewSessionStore(sessDir)
	metas, err := store.ListSessions()
	if err != nil {
		return []app.ChatItem{}
	}
	var items []app.ChatItem
	for _, m := range metas {
		title := m.Summary
		if title == "" {
			title = m.SessionID
		}
		items = append(items, app.ChatItem{
			ID:         m.SessionID,
			Title:      title,
			CreatedAt:  m.ModTime.Unix(),
			WorkingDir: m.WorkingDir,
		})
	}
	return items
}

// OpenBrowserWindow 使用 Wails v3 官方多窗口 API 打开内置浏览器窗口。
func (a *App) OpenBrowserWindow(url string) {
	url = strings.TrimSpace(url)
	if url == "" {
		return
	}
	application.Get().Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            url,
		Width:            1200,
		Height:           800,
		MinWidth:         800,
		MinHeight:        500,
		URL:              url,
		BackgroundColour: application.NewRGB(255, 255, 255),
	})
}
