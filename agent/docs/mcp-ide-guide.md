# MCP & IDE Integration Guide

[← Back to README](../README.md)

deepcodex includes a full MCP (Model Context Protocol) server that lets any compatible IDE use it as a tool provider. This is separate from agent mode — here, your IDE's AI does the thinking, and deepcodex provides the tools.

---

## How It Works

```
Your IDE (Cursor, Kiro, VS Code, etc.)
  ↓ sends tool requests via MCP protocol
deepcodex mcp-serve (stdio or HTTP)
  ↓ executes tools
File system, shell, workspace analysis
```

Your IDE handles the LLM calls. deepcodex handles the tool execution.

---

## Starting the MCP Server

```bash
# stdio transport (for IDE integration)
deepcodex mcp-serve --transport stdio

# HTTP transport (for any client)
deepcodex mcp-serve --transport http --addr :8080
```

---

## IDE Setup

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "deepcodex": {
      "command": "deepcodex",
      "args": ["mcp-serve", "--transport", "stdio"]
    }
  }
}
```

### Kiro

Add to `~/.kiro/settings/mcp.json` or `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "deepcodex": {
      "command": "deepcodex",
      "args": ["mcp-serve", "--transport", "stdio"],
      "disabled": false,
      "autoApprove": ["tools/list"]
    }
  }
}
```

### VS Code (Copilot Chat / Continue)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "deepcodex": {
      "type": "stdio",
      "command": "deepcodex",
      "args": ["mcp-serve", "--transport", "stdio"]
    }
  }
}
```

### Antigravity

Add to `.gemini/settings/mcp.json`:

```json
{
  "mcpServers": {
    "deepcodex": {
      "command": "deepcodex",
      "args": ["mcp-serve", "--transport", "stdio"],
      "disabled": false
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "deepcodex": {
      "command": "deepcodex",
      "args": ["mcp-serve", "--transport", "stdio"]
    }
  }
}
```

### Any HTTP Client

```bash
deepcodex mcp-serve --transport http --addr :8080
# POST http://localhost:8080/mcp
```

---

## Available MCP Tools

### Standard File-System Tools

| Tool | Description |
|------|-------------|
| `BashTool` | Execute shell commands with timeout and exit code capture |
| `FileReadTool` | Read files with optional line range selection |
| `FileEditTool` | Edit files via exact search and replace |
| `FileWriteTool` | Create or overwrite files with auto-mkdir |
| `GlobTool` | Find files matching glob patterns |
| `GrepTool` | Recursive content search with include filters |
| `ListDirectoryTool` | List directories with file sizes |

### deepcodex-Exclusive Orchestration Tools

| Tool | Description |
|------|-------------|
| `gocode_route` | Route prompts to best-matching tools via token scoring |
| `gocode_bootstrap` | Initialize a full agent session with workspace analysis |
| `gocode_workspace_scan` | Deep structural analysis of your codebase |
| `gocode_session_save` | Persist session state atomically to disk |
| `gocode_session_load` | Restore saved sessions |
| `gocode_list_commands` | Discover all registered commands |
| `gocode_manifest` | Generate full project health manifest |

---

## MCP Protocol Compliance

| Feature | Status |
|---------|--------|
| `initialize` / `notifications/initialized` handshake | ✅ |
| `tools/list` with `name`, `description`, `inputSchema` | ✅ |
| `tools/call` with `content` block responses | ✅ |
| `ping` keepalive | ✅ |
| `resources/list` (empty, spec-compliant) | ✅ |
| `prompts/list` (empty, spec-compliant) | ✅ |
| `logging/setLevel` | ✅ |
| JSON-RPC 2.0 error codes | ✅ |
| Notification handling | ✅ |

---

[← Back to README](../README.md)
