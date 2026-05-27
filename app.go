package main

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/zboya/deepcodex/agent/apiclient"
	"github.com/zboya/deepcodex/app"
)

// App struct
type App struct {
	ctx context.Context

	*app.Models
	*app.Projects

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

	return nil
}

// ServiceShutdown is called by Wails v3 when the bound service shuts down.
func (a *App) ServiceShutdown() error {
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

	if projectID == "" { // default chat
		c := app.NewChatWithWorkDir(a.ctx, "")
		a.projectChats[projectID] = c
	}

	// double-check
	if c, ok := a.projectChats[projectID]; ok {
		return c
	}

	proj, err := a.Projects.GetProject(projectID)
	if err != nil {
		slog.Error(fmt.Sprintf("[app] project not found: %s, %v", projectID, err))
		return a.projectChats[""]
	}

	// 会话存储在项目目录下的 .port_sessions
	c := app.NewChatWithWorkDir(a.ctx, proj.Path)
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
func (a *App) SendMessage(input *app.InputMessage) app.Message {
	return a.getChat(input.Proj.ID).SendMessage(input)
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

// ListMCPServers 返回默认 harness 中已配置的 MCP 服务器列表。
func (a *App) ListMCPServers(projectID string) []app.MCPServerItem {
	h := a.getChat(projectID).GetHarness()
	mcp := app.NewMCP(h)
	return mcp.List()
}

// ListSkills 返回所有可用的 Skills 列表（内置 + 用户自定义）。
func (a *App) ListSkills(projectID string) []app.SkillItem {
	h := a.getChat(projectID).GetHarness()
	if h == nil {
		return []app.SkillItem{}
	}
	sk := app.NewSkills(h)
	return sk.List()
}

// ─── session store 直接查询（不依赖 harness）────────────────────────────────

// ListSessionsForProject 直接从磁盘读取项目的会话列表（无需 Harness 初始化）
func (a *App) ListSessionsForProject(projectID string) []app.ChatItem {
	proj, err := a.Projects.GetProject(projectID)
	if err != nil {
		return []app.ChatItem{}
	}
	return a.getChat(proj.ID).ListChats()
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
