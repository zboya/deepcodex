# DeepCodex

> 基于 [Wails](https://wails.io/) 框架开发的桌面端 AI 智能开发助手，UI 仿 OpenAI Codex 应用。

## ✨ 功能特性

- 🎨 **暗色 UI**：仿 Codex 桌面端的现代深色界面
- 📂 **项目侧栏**：项目列表、对话历史、快捷入口
- 💬 **智能对话区**：支持多行输入、模型/权限切换、语音输入按钮
- 🔌 **第三方连接器**：Slack、GitHub、Linear 集成卡片（UI 占位）
- ⚡ **跨平台**：基于 Wails，支持 macOS / Windows / Linux

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | [Wails v2](https://wails.io/) |
| 后端 | Go 1.21+ |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | 原生 CSS（暗色主题） |
| 图标 | 内联 SVG（无外部依赖） |

## 📦 项目结构

```
deepcodex/
├── main.go              # Wails 主入口
├── app.go               # 后端绑定方法（前端通过 wails 调用）
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # 应用根组件
│   │   ├── App.css              # 全局样式
│   │   ├── types.ts             # TS 类型
│   │   └── components/
│   │       ├── Sidebar.tsx      # 左侧栏
│   │       ├── MainContent.tsx  # 右侧主区
│   │       ├── InputArea.tsx    # 输入区
│   │       ├── ConnectorCard.tsx# 连接卡片
│   │       └── Icons.tsx        # SVG 图标集
│   └── ...
└── wails.json
```

## 🚀 开发与构建

### 环境要求

- Go ≥ 1.21
- Node.js ≥ 18
- Wails CLI： `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

### 开发模式

```bash
wails dev
```

### 打包构建

```bash
wails build
```

构建产物会输出在 `build/bin/` 下。

## 📡 后端接口（Go ↔ JS）

`app.go` 当前提供以下绑定方法（占位，待后续实现具体逻辑）：

| 方法 | 说明 |
|---|---|
| `Greet(name)` | 示例方法 |
| `ListProjects()` | 列出工作区项目 |
| `ListChats()` | 列出对话历史 |
| `CreateChat(title)` | 新建对话 |
| `SendMessage(chatID, content)` | 发送消息（待对接 LLM） |

## 📅 后续计划

- [ ] 接入 LLM（OpenAI / Claude / 本地模型）
- [ ] 项目工作区文件读取与索引
- [ ] 对话持久化存储
- [ ] GitHub / Slack / Linear 真正接入
- [ ] 自动化任务调度

## 📄 License

MIT
