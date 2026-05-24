package main

import (
	"context"
	"fmt"
	"time"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// ===== 以下为前端将通过 wails 绑定调用的接口占位 =====
// 实际后端逻辑（LLM 调用、文件读写、Git 操作等）将在后续实现。

// Project 项目信息
type Project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

// ChatItem 对话条目
type ChatItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt int64  `json:"createdAt"`
}

// Message 单条消息
type Message struct {
	ID      string `json:"id"`
	Role    string `json:"role"` // user / assistant / system
	Content string `json:"content"`
	Time    int64  `json:"time"`
}

// Greet returns a greeting for the given name (保留默认示例)
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// ListProjects 列出工作区内的项目（占位）
func (a *App) ListProjects() []Project {
	return []Project{
		{ID: "p1", Name: "nanochat", Path: ""},
		{ID: "p2", Name: "chatgpt-demo", Path: ""},
		{ID: "p3", Name: "ansible", Path: ""},
	}
}

// ListChats 列出对话历史（占位）
func (a *App) ListChats() []ChatItem {
	return []ChatItem{}
}

// CreateChat 新建对话（占位）
func (a *App) CreateChat(title string) ChatItem {
	return ChatItem{
		ID:        fmt.Sprintf("chat-%d", time.Now().UnixNano()),
		Title:     title,
		CreatedAt: time.Now().Unix(),
	}
}

// SendMessage 向某个对话发送消息（占位，未来对接 LLM）
func (a *App) SendMessage(chatID string, content string) Message {
	return Message{
		ID:      fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:    "assistant",
		Content: fmt.Sprintf("[stub] received: %s", content),
		Time:    time.Now().Unix(),
	}
}
