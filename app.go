package main

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
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
	defaultChat *app.Chat

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

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
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
		return
	}
	a.defaultChat = app.NewChat(ctx, h)
	slog.Info(fmt.Sprintf("[app] default harness initialized, model=%s", h.Model))
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	if a.defaultChat != nil {
		a.defaultChat.Close()
	}
	a.chatMu.Lock()
	for _, c := range a.projectChats {
		c.Close()
	}
	a.chatMu.Unlock()
}

// ─── 项目相关接口（覆盖/扩展 Projects 方法）─────────────────────────────────

// SelectDirectory 打开原生目录选择对话框，返回用户选择的路径
func (a *App) SelectDirectory() (string, error) {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择项目目录",
	})
	if err != nil {
		return "", err
	}
	return path, nil
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
func (a *App) SendMessage(projectID string, chatID string, content string, opts app.SendOptions) app.Message {
	return a.getChat(projectID).SendMessage(chatID, content, opts)
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
	a.shutdown(a.ctx)
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
