package main

import (
	"embed"
	"log/slog"
	"os"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func initLogger() {
	levelStr := strings.ToUpper(os.Getenv("DEEPCODEX_LOG_LEVEL"))
	var level slog.Level
	switch levelStr {
	case "DEBUG":
		level = slog.LevelDebug
	case "INFO":
		level = slog.LevelInfo
	case "WARN", "WARNING":
		level = slog.LevelWarn
	case "ERROR":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	handler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	slog.SetDefault(slog.New(handler))
}

func main() {
	initLogger()
	appService := NewApp()

	app := application.New(application.Options{
		Name:        "DeepCodex",
		Description: "AI coding assistant desktop app",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "DeepCodex",
		Width:            1280,
		Height:           820,
		MinWidth:         900,
		MinHeight:        600,
		URL:              "/",
		BackgroundColour: application.NewRGB(26, 26, 26),
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})

	if err := app.Run(); err != nil {
		slog.Error("Error running app", "err", err)
	}
}
