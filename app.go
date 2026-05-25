package main

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/zboya/deepcodex/agent/apiclient"
	"github.com/zboya/deepcodex/agent/harness"
	"github.com/zboya/deepcodex/app"
)

// App struct
type App struct {
	ctx context.Context

	*app.Models
	*app.Chat
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		Models: &app.Models{},
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

	// Initialize the AI harness
	h, err := harness.New(harness.Options{
		SkipPermissions: true,
		MaxTurns:        30,
	})
	if err != nil {
		slog.Error(fmt.Sprintf("[app] failed to initialize harness: %v", err))
		return
	}
	a.Chat = app.NewChat(ctx, h)
	slog.Info(fmt.Sprintf("[app] harness initialized, model=%s", h.Model))
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	if a.Chat != nil {
		a.Chat.Close()
	}
}
