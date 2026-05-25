# Agent Mode Guide

[← Back to README](../README.md)

deepcodex's agent mode lets you use any supported LLM as a standalone coding agent directly from your terminal. No IDE required.

---

## Setting Up Your API Key

Set one environment variable for your preferred provider:

```bash
# Anthropic Claude
export ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI GPT
export OPENAI_API_KEY=sk-proj-...

# Google Gemini
export GEMINI_API_KEY=AIza...
# or
export GOOGLE_API_KEY=AIza...

# xAI Grok
export XAI_API_KEY=xai-...
```

Add it to your `~/.zshrc`, `~/.bashrc`, or `~/.bash_profile` to persist across sessions:

```bash
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
source ~/.zshrc
```

You can also pass the key inline with `--api-key`:

```bash
deepcodex chat --api-key sk-ant-api03-...
```

### Anthropic Advanced Auth

Anthropic supports two auth methods simultaneously:

| Env Var | Purpose |
|---------|---------|
| `ANTHROPIC_API_KEY` | Standard API key (sent as `x-api-key` header) |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token for OAuth/proxy setups |

If both are set, deepcodex sends both headers on every request.

---

## Interactive Chat (`deepcodex chat`)

Start a conversation:

```bash
deepcodex chat
```

You'll see a prompt:

```
deepcodex agent — type /exit to quit, /clear to reset, /cost for usage

you> help me refactor the auth module
```

The agent will read your code, suggest changes, run tools, and iterate until the task is done.

### Chat Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--model` | `sonnet` | Model name or alias |
| `--max-turns` | `30` | Max agent loop iterations per message |
| `--max-tokens` | `8192` | Max output tokens per API request |
| `--api-key` | (env var) | Override API key |
| `--resume` | — | Resume a saved session by ID |

### Slash Commands

| Command | What It Does |
|---------|-------------|
| `/exit` | Quit the session (also: Ctrl+D) |
| `/clear` | Reset conversation history, keep connection |
| `/cost` | Show cumulative token usage and cost |

### Multi-line Input

End a line with `\` to continue on the next line:

```
you> write a function that\
takes a list of integers\
and returns the sum
```

---

## One-Shot Mode (`deepcodex prompt`)

Run a single prompt and exit:

```bash
deepcodex prompt "find all files with TODO comments and list them"
```

### Prompt Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--model` | `sonnet` | Model name or alias |
| `--max-turns` | `30` | Max agent loop iterations |
| `--max-tokens` | `8192` | Max output tokens per request |
| `--api-key` | (env var) | Override API key |
| `--no-stream` | `false` | Wait for full response before printing |

### Examples

```bash
# Use GPT-4o
deepcodex prompt --model gpt4o "explain this codebase structure"

# Use Gemini
deepcodex prompt --model gemini "write tests for the auth module"

# Use Grok
deepcodex prompt --model grok "find performance bottlenecks in main.go"

# Disable streaming for piping
deepcodex prompt --no-stream "list all exported functions" > functions.txt
```

---

## Changing Models

Use the `--model` flag with either a short alias or a full model ID:

```bash
# Short aliases
deepcodex chat --model opus          # Claude Opus 4.6
deepcodex chat --model sonnet        # Claude Sonnet 4.6
deepcodex chat --model gpt5          # GPT-5.4
deepcodex chat --model gpt54-mini    # GPT-5.4 Mini
deepcodex chat --model gpt4o         # GPT-4o (legacy)
deepcodex chat --model o3             # OpenAI o3
deepcodex chat --model gemini        # Gemini 3.1 Pro
deepcodex chat --model gemini-flash  # Gemini 3 Flash
deepcodex chat --model grok          # Grok 4.20 Beta
deepcodex chat --model codex         # Codex Mini

# Full model IDs
deepcodex chat --model claude-opus-4-6
deepcodex chat --model gpt-5.4
deepcodex chat --model gemini-3.1-pro-preview
deepcodex chat --model grok-4.20-beta
```

### Model Alias Table

| Alias | Resolves To | Provider |
|-------|------------|----------|
| `opus` | `claude-opus-4-6` | Anthropic |
| `sonnet` | `claude-sonnet-4-6` | Anthropic |
| `haiku` | `claude-haiku-4-5-20251213` | Anthropic |
| `gpt5` / `gpt54` / `gpt` | `gpt-5.4` | OpenAI |
| `gpt5-mini` / `gpt54-mini` | `gpt-5.4-mini` | OpenAI |
| `gpt54-nano` | `gpt-5.4-nano` | OpenAI |
| `gpt4o` / `gpt4` | `gpt-4o` | OpenAI |
| `gpt4-mini` | `gpt-4o-mini` | OpenAI |
| `o1` | `o1` | OpenAI |
| `o1-mini` | `o1-mini` | OpenAI |
| `o3` | `o3` | OpenAI |
| `o3-mini` | `o3-mini` | OpenAI |
| `o4-mini` | `o4-mini` | OpenAI |
| `codex` | `codex-mini-latest` | OpenAI |
| `gemini` / `gemini-pro` | `gemini-3.1-pro-preview` | Google |
| `gemini-flash` | `gemini-3-flash` | Google |
| `gemini-2.5` | `gemini-2.5-pro` | Google |
| `grok` | `grok-4.20-beta` | xAI |
| `grok-3` | `grok-3` | xAI |
| `grok-mini` | `grok-3-mini` | xAI |
| `grok-2` | `grok-2` | xAI |

### Auto-Detection

If you don't specify `--model`, deepcodex defaults to `sonnet` (Claude Sonnet 4.6). The provider is auto-detected from the model name:

- `claude*` → Anthropic
- `gpt*`, `o1*`, `o3*`, `o4*`, `codex*` → OpenAI
- `gemini*` → Google
- `grok*` → xAI

If the model name doesn't match any prefix, deepcodex checks which API key env vars are set and picks the first available.

---

## Custom Base URLs

Override the API endpoint for any provider:

```bash
# Anthropic proxy
export ANTHROPIC_BASE_URL=https://my-proxy.example.com

# OpenAI-compatible endpoint (e.g., Azure, local)
export OPENAI_BASE_URL=https://my-openai-proxy.example.com/v1

# Gemini proxy
export GEMINI_BASE_URL=https://my-gemini-proxy.example.com/v1beta/openai

# xAI proxy
export XAI_BASE_URL=https://my-xai-proxy.example.com/v1
```

This works with any OpenAI-compatible API (LiteLLM, Ollama, vLLM, etc.):

```bash
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=ollama
deepcodex chat --model llama3.1
```

---

## How the Agent Loop Works

1. You send a message
2. deepcodex sends it to the LLM with your conversation history + available tools
3. The LLM responds with text and/or tool calls
4. deepcodex executes each tool (file read, shell command, etc.)
5. Tool results are sent back to the LLM
6. Repeat until the LLM responds with just text (no more tool calls)

The loop has safety limits:
- `--max-turns` caps the number of iterations (default: 30)
- Permission prompts for dangerous operations (in `chat` mode)
- Token usage tracking via `/cost`

---

## Available Tools

When running as an agent, the LLM can use these tools:

| Tool | What It Does |
|------|-------------|
| `BashTool` | Run shell commands |
| `FileReadTool` | Read file contents |
| `FileEditTool` | Edit files via search/replace |
| `FileWriteTool` | Create or overwrite files |
| `GlobTool` | Find files by pattern |
| `GrepTool` | Search file contents |
| `ListDirectoryTool` | List directory contents |

---

[← Back to README](../README.md)
