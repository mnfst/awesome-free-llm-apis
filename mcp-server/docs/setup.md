# Setup Guide

This guide covers the necessary steps to set up the MCP server and its provider dependencies.

## Prerequisites

- **Node.js** (v18 or higher; **v20+ required** if you'll use `browser_tool` — see below)
- **Python 3** (v3.9 or higher)
- **npm** (comes with Node.js)
- **Chrome/Chromium** — only needed for `browser_tool`. It spawns [`chrome-devtools-mcp`](https://www.npmjs.com/package/chrome-devtools-mcp) on demand via `npx -y chrome-devtools-mcp` (no separate install step; the first call is slower while `npx` fetches it). If Chrome isn't auto-discovered, set `CHROME_PATH` to its executable. See [browser_tool.md](browser_tool.md) for the full action reference.

## Installation

### 1. Node.js Dependencies & Cross-Platform Sync

Install the core server dependencies. **Note:** You must use the `--legacy-peer-deps` flag to resolve a conflict between `vectra` and `transformers` v4.

```bash
cd mcp-server
npm install --legacy-peer-deps
```

> **Note:** This project uses `quickjs-emscripten`, which requires platform-specific dependencies (like `@emnapi/core` and `@emnapi/runtime`) to be present in the `package-lock.json` for CI/CD runners (like Linux). To ensure these are always included in the lock file regardless of your development OS (Windows/macOS), they are tracked in `devDependencies`. If you see `npm ci` failures in CI, please run `npm install --legacy-peer-deps` locally to refresh the lock file.

### 2. Python Environment (for Gemini)

The Google Gemini provider uses the official `google-genai` Python SDK via a bridge. You need to set up a virtual environment:

```bash
cd mcp-server

# Create the virtual environment
python -m venv venv

# Activate it:
#   Linux / macOS ......  source venv/bin/activate
#   Windows (PowerShell)  .\venv\Scripts\Activate.ps1
#   Windows (cmd) .......  venv\Scripts\activate.bat

pip install -U google-genai python-dotenv
```

> [!NOTE]
> **`code_mode` is deprecated and not registered as an MCP tool** (`src/mcp/index.ts`). The sandbox runners it used (Python/Go/Rust isolated script execution) still exist under `scripts/sandboxes/` for reference, but there's nothing to install here for a normal setup — skip straight to Configuration below.

## Configuration

### Environment Variables

Create a `.env` file in the `mcp-server` directory (you can use `.env.example` as a template):

```bash
# Linux / macOS
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Fill in your API keys for the providers you wish to use.

### API Keys

- **GEMINI_API_KEY**: Required for the Google Gemini provider.
- **CO_API_KEY**: Required for the Cohere provider (V2 SDK).
- **SILICONFLOW_API_KEY**: Required for SiliconFlow.
- (See `.env.example` for all supported providers).

### Feature Flags

- **ENABLE_AGENTIC_MIDDLEWARE**: Set to `true` to enable the agentic middleware globally for all requests. 
- **AGENT_PROMPT_PATH**: Path to the directory containing `prompt.json` and `README.md` (default: `../external/agent-prompt`).
    > [!IMPORTANT]
    > **Session IDs**: When this flag is enabled, every request **must** include a `sessionId` (either in the context or the request body). Requests without a `sessionId` will bypass the middleware to ensure data safety.
- **MCP_SUBTASK_BUDGET_MS**: Wall-clock budget (ms, default `20000`) for a single agentic `use_free_llm` call before it yields a partial result and keeps executing remaining subtasks in the background. Keep this under your MCP client's tool-call timeout (many code editors default to ~30s). See [Architecture & Workflow Guide § 5](guide.md#5-agentic-middleware--state-management).

## Running the Server

Start the MCP server in development mode:

```bash
cd mcp-server
npm run dev
```

Then visit `http://localhost:3000` to view the visual dashboard for provider health and token tracking.

## Using `use_free_llm` for project-scoped work

`use_free_llm` is the main tool and its current parameters are (see `src/mcp/index.ts` for the authoritative schema):

| Param | Required? | Purpose |
|---|---|---|
| `messages` | **required** | `{role, content}[]` — the conversation. |
| `model` | optional | Specific model ID; omit to let the router pick. |
| `keywords` | optional | Steering tags (e.g. `["python", "sql"]`) to prioritize reference-map injection. |
| `agentic` | optional | Enables task decomposition + memory/wiki injection. **Set `true` for any project-scoped work.** |
| `workspace_root` | recommended | Absolute path to the project root. Required for memory enrichment, context retrieval, and workspace-scoped recall. |
| `sessionId` | optional | Partitions state/logs; auto-derived from `workspace_root` if omitted. |
| `skipIndexing` | optional | Skips the pre-emptive full-workspace re-index + wiki-maintenance pass agentic mode normally runs every call. Set `true` for requests narrowly about one file/PDF that don't need a full re-scan. |
| `google_search` | optional | Enable Google Search grounding for Gemini models. |
| `skill` | optional | Load a specific skill by id/name from the remote skill index. |
| `action` | optional | Control an in-progress/paused agentic run for `sessionId`: `run` (default), `status` (poll progress, no LLM call), `continue` (resume a paused queue), `abort` (cancel a background run). |
| `resume_input` | optional | For `action: 'continue'` — extra input appended to the subtask being resumed. |

> [!IMPORTANT]
> **When performing any task scoped to a project or workspace, you MUST pass both `workspace_root` (absolute path) and `agentic: true`.** Omitting either disables memory injection, context enrichment, and session persistence — the response will be blind to prior work. A bare call with only `messages` is for one-off queries that don't need project context.

```json
{ "messages": [...], "agentic": true, "workspace_root": "/abs/path/to/project", "keywords": ["python"] }
```

### Project conventions this server picks up automatically

- **`.agents/AGENTS.md`** — per-project agent guidance (persona override, project description, etc). Auto-created on first agentic call against a `workspace_root` if it doesn't already exist; if you've hand-authored one, it's never overwritten — only the boilerplate template gets prepended ahead of your content. In a monorepo, this file can live at the repo root above a subproject's `workspace_root` — the server walks up (bounded) to find it, so subprojects share one canonical file (see `src/utils/agents-md-locator.ts`).
- **Per-workspace wiki storage** — `agentic` mode's wiki memory is stored under `<workspace_root>/.free-llm-mcp/wiki/`, scoped to that project (falls back to a global `~/.free-llm-mcp/wiki/` location only for namespaces with no workspace, e.g. shared cyber-tools knowledge).

## MCP Client Configuration

To use this server with an MCP-compatible LLM client (like Claude Desktop), add the following to your configuration file:

### Option A: Running with `dist` (After `npm run build`)

```json
{
  "mcpServers": {
    "free-llm-apis": {
      "command": "node",
      "args": [
        "--env-file=</path/to/awesome-free-llm-apis>/mcp-server/.env",
        "</path/to/awesome-free-llm-apis>/mcp-server/dist/server.js"
      ]
    }
  }
}
```

### Option B: Running with `tsx` (Development)

```json
{
  "mcpServers": {
    "free-llm-apis": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "--env-file=</path/to/awesome-free-llm-apis>/mcp-server/.env",
        "</path/to/awesome-free-llm-apis>/mcp-server/src/server.ts"
      ]
    }
  }
}
```

### Option C: Remote Connection (Streamable HTTP)

If the server is running with the `--sse` flag, any MCP client can connect via the unified HTTP endpoint:

**URL**: `http://localhost:3000/mcp`

This is the preferred method for connecting browser-based clients or remote instances.

### Option D: Running with `npx` (Streamlined)

If you have the repository cloned locally, you can run the server directly using `npx`:

```json
{
  "mcpServers": {
    "free-llm-apis": {
      "command": "npx",
      "args": [
        "-y",
        "/path/to/awesome-free-llm-apis/mcp-server"
      ],
      "env": {
        "GEMINI_API_KEY": "your_key",
        "CO_API_KEY": "your_key"
      }
    }
  }
}
```

*Note: This method is ideal for quick testing as it uses the `bin` configuration defined in `package.json`.*

## Installing the AI Agent Skill

This repository includes a specialized skill for AI coding agents (like Claude Code / Antigravity) to properly use the `free-llm-apis` tools, handle fallback routing, and manage persistent memory.

To install the skill so your AI agent can use it:

```bash
# Linux / macOS
mkdir -p ~/.gemini/config/skills/free-llms
cp -r mcp-server/docs/skill/* ~/.gemini/config/skills/free-llms/
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.gemini\config\skills\free-llms\"
Copy-Item -Recurse mcp-server\docs\skill\* "$env:USERPROFILE\.gemini\config\skills\free-llms\"
```

Once copied, your agent will automatically detect the `@free-llms` skill and its associated reference documents for calling the `@mcp:free-llm-apis` tools. Just call the skill in prompts like:

```
@free-llms Hey help me orchestrate a workflow to extract the top 10 most starred repositories from GitHub and save them to a CSV file.
```

## Running Smoke Tests

```bash
cd mcp-server
npm run smoke-test
```

## Available Tools

The current registered MCP tools (`src/mcp/index.ts`):

- **`use_free_llm`** — universal chat interface with automatic provider failover; see parameters above.
- **`vision_tool`** — analyze a local image via a vision-capable model.
- **`load_skill_prompt`** — search for or load a dynamic skill from the skill index.
- **`get_token_stats`** — inspect provider/token usage.
- **`validate_provider`** — check whether a given provider/model is currently usable.
- **`manage_memory`** — `wiki_search` / `wiki_write` / `wiki_list` / `wiki_read` / `search` / `list` / `stats` / `clear` actions against a workspace's memory.
- **`store_workspace_skill`** — persist a reusable workspace-specific skill.
- **`index_workspace`** — force a full workspace re-index (accepts a `force` param).
- **`execute_skill`** — run a previously stored/loaded skill against a workspace.

(`code_mode` is deprecated and not in this list — see the note in Installation above.)

## Orchestration Pipeline

The server uses a pipeline for model selection and token management. For a deep dive into how routing, caching, and failover work, see the [Architecture & Workflow Guide](guide.md).

### Performance Features
- **Token Interpolation**: Uses `js-tiktoken` for local token counting.
- **Header Synchronization**: Automatically adjusts quotas based on `x-ratelimit-*` response headers.
- **Tiered Fallbacks**: Dynamically switches models based on task type (Coding, Chat, etc.).
