---
name: free-llms
description: "Orchestrate multiple free LLM providers, manage persistent workspace memory, and utilize keyword-based steering for project-specific reference extraction and various agentic workflows."
metadata:
  category: utility
  triggers: free models, llm cost, fallback, routing, token tracking, workspace memory, context-aware steering, reference extractor, keyword classification, project discovery, gemini, groq, cohere, cloudflare, deepseek, qwen, compression, execute skill, vision tool, agentic, reasoning, planning, subtask decomposition, pdf grounding, semantic wiki, adr tracking, prompt json, keywords steering
---

# Free LLM APIs — Usage Guide

Discipline for orchestrating multiple free LLM providers via the `@mcp:free-llm-apis` MCP server.

> **v1.0.9 Update**: Consolidated 11 subsystem benchmarks, strict `keywords[]` context bloat prevention, section-based `prompt.json` prompt steering, and local dashboard integration.

---

## 🎯 When to Use

- **Cost-Effective Inference**: Use free frontier or mid-tier models instead of paid APIs.
- **Resilient Workflows**: Automatic fallback ensures completion even during rate limits.
- **Stateful Context**: Persist findings or decisions across multiple turns/sessions.
- **Architectural Steering**: Project-specific documentation or architectural maps guide implementation.
- **Keyword-Driven Context Protection**: Feed external system prompts situationally via `keywords[]` without context window bloat.

---

## ⚡ Quick Routing Reference

| Use Case | Model | Provider | Notes |
|----------|-------|----------|-------|
| Fast Chat | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `cloudflare` | 100% success, ~1300ms ⚡ |
| Coding | `qwen/qwen3-coder-480b-a35b:free` | `openrouter` | 480B coder, FREE |
| Deep Reasoning | `deepseek-ai/DeepSeek-R1` | `openrouter` | Chain-of-thought |
| High-Tier Reasoning | `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia` | Planning/subtask planner |
| Bulk Tasks | `Qwen/Qwen2.5-72B-Instruct` | `siliconflow` | 1,000 RPM — best for bulk |

---

## 🔑 Keyword Ingestion & System Prompt Steering

This section details how `keywords[]` steer external prompt injection, control memory gates, and prevent context bloat across single-pass and multi-pass executions.

### 1. Section-Based System Prompt Ingestion (`prompt.json`)
System instructions are backed by `external/agent-prompt/prompt.json`. The prompt generator scans the user's incoming prompt and explicit `keywords[]` against section `keywords` arrays in `prompt.json`:
- **Matching Keywords**: Only sections whose `keywords` array intersects with the query are injected into `messages[0]`.
- **General Queries**: Unmatched sections stay on disk in `prompt.json` and are **never** injected into context.
- **Context Bloat Prevention**: Passing `keywords: []` on direct queries prevents uncalibrated prompt expansion, reducing System Prompt size from **2,144 tokens** down to **943 tokens** (56% token reduction).

### 2. External Skill Steering (`load_skill_prompt` & `execute_skill`)
Skill prompt loading is driven strictly by explicit `keywords[]`:
- **Situational Ingestion**: `load_skill_prompt({ type: 'search', keywords: ['debug', 'auth'] })` searches local skill manifests and bundled Hermes skills (`src/external/hermes/`).
- **Empty Keywords Guard**: When `keywords: []` is empty, skill search immediately returns `{ success: true, skills: [] }` with **0 tokens bloat**.
- **Adapter Note Overhead**: Loading a Hermes skill injects a 101-token environment override note ahead of `SKILL.md` content to enforce MCP memory/browser tool usage rules.

### 3. Memory Gate Keyword Isolation
External context is situationally injected inside XML isolation gates:
- `<memory_context_isolation_gate>`: Ingests `LongTermMemory` saved tool outputs and confidence scores.
- `<wiki_context_isolation_gate>`: Ingests matched `WikiMemory` architecture notes.
- `<workspace_context_isolation_gate>`: Ingests code snippets selected by Born-rule sampling from `VectorStore`.

### 4. Local Dashboard Keyword & Memory Visualization (`http://localhost:3000`)
When running in SSE mode, open `http://localhost:3000` to inspect:
- **Live Memory Layer Breakdown**: Real-time token consumption across ShortTerm, LongTerm, Wiki, and VectorStore gates.
- **Keyword Match Audits**: Visual highlights showing which `keywords[]` triggered specific prompt section injections.
- **Agentic vs Non-Agentic Toggle**: Real-time comparison of `isOnePass: true` (1,030 tok payload) vs `isOnePass: false` (2,673 tok payload).

---

## 🛠️ Tool Reference

### `use_free_llm`
Perform chat completion with optional fallback and workspace memory.

> [!IMPORTANT]
> **MANDATORY PROJECT RULE**: For any workspace task, you MUST set `"agentic": true` AND provide `"workspace_root"`. This enables session memory and grounding.

> [!NOTE]
> Agentic calls run under a server-side time budget and may return a partial result that keeps
> completing in the background — poll with `"action": "status"` rather than re-sending the full
> prompt. See "⚠️ Agentic Behavior & Limits" below.

#### ⚡ Task Decomposition & Planning
When `"agentic": true` is enabled, the pipeline decomposes the user's goal into subtasks. You can control this in two ways:
1. **Automatic Planning (Recommended)**: Leave the prompt as plain prose. The system will use a reasoning/planning model to automatically decompose the goal and determine dependencies.
2. **Explicit DSL Steering**: Manually prefix your task list using:
   - `>` for **parallel** tasks (e.g. `> read auth.ts`). Tasks of the same middleware `TaskType` are automatically downgraded to sequential to avoid race conditions.
   - `-` or `*` or `1.` for **sequential** tasks.

**Example:**
```json
{
  "messages": [{ "role": "user", "content": "> read auth.ts\n> search for API keys\n- implement new middleware" }],
  "keywords": ["security", "auth", "middleware"],
  "agentic": true,
  "workspace_root": "c:/Users/mahes/project"
}
```

#### Working with `pdf://`/`file://` references that aren't a workspace task
`pdf://`, `file://`, and `artifact://` reference resolution — including PDF-to-wiki indexing — works regardless of `agentic`. It does **not** require workspace mode. So for a request that's narrowly about a document (e.g. "summarize this PDF") and doesn't touch the codebase, the simplest and cheapest option is to just **not** set `"agentic": true` at all:
```json
{
  "messages": [{ "role": "user", "content": "[notes](pdf://docs/manual.pdf:12) summarize this page" }]
}
```
This resolves the reference and indexes it into the wiki (under a workspace-scoped `pdf/` subdirectory, kept separate from codebase-architecture pages) with none of the overhead below.

If you genuinely need *both* — e.g. "read this PDF spec and implement it in `src/routes.ts`" — you still want `"agentic": true` for the coding half. In that mixed case only, every agentic call with a `workspace_root` also backgrounds (non-blocking) a pre-emptive full-workspace re-index followed by a wiki-maintenance pass (regenerating general codebase-architecture wiki pages). That's the right default when the task is genuinely about the codebase, but you can opt out of it with `"skipIndexing": true` if you know this particular call doesn't need it — this flag must be set on the initial request itself; it cannot be toggled mid-pipeline:
```json
{
  "messages": [{ "role": "user", "content": "[notes](pdf://docs/manual.pdf:12) summarize this page" }],
  "agentic": true,
  "workspace_root": "c:/Users/mahes/project",
  "skipIndexing": true
}
```

---

### `load_skill_prompt`
Search for or load a dynamic skill from the agentic-awesome skills index or bundled Hermes manifest (`src/external/hermes/`).

- **Parameters**:
  - `type` (required): `"load"` to download/load a specific skill, or `"search"` to find skills.
  - `name` (required if type is `"load"`): The name or ID of the skill to load.
  - `keywords` (optional): Array of string keywords to search for skills. If omitted, extracted automatically from `name`.
  - `source` (optional): `"agentic-awesome"` or `"hermes"`.
  - `workspaceDir` (optional): Absolute path to the workspace directory for local storage.
- **How it Works**: If type is `"search"`, queries local skill indices and bundled Hermes skills using `keywords[]`. If `keywords: []` is empty, returns `{ success: true, skills: [] }` to prevent context bloat. If type is `"load"`, loads SKILL.md prompt ready for system injection.

---

### `execute_skill`
Execute a prompt using a specific local or Hermes skill's instructions and reference files.

- **Parameters**:
  - `skill` (required): Name of the skill directory under `.free-llm-mcp/skills/` or bundled Hermes skills.
  - `input` (required): The prompt or instruction to run.
  - `model` (optional): Specific model override.
  - `workspace_root` (optional): Absolute path to the project root.
- **How it Works**: Automatically extracts relative file paths referenced in `SKILL.md` (e.g., `references/*.md`), loads their contents, injects a 101-token Hermes adapter note if applicable, and executes the model.

---

### `vision_tool`
Analyze local images or remote image URLs in single-pass (`isOnePass: true`) or multi-pass agentic mode (`isOnePass: false`).
- **Parameters**:
  - `image_path` (required): Absolute path or `file:///` URI to the local image.
  - `prompt` (optional): Text prompt accompanying the image.
- **How it Works**: Resolves Windows paths, converts image to base64, and routes to an available vision provider (Gemini, Llama-Vision).

---

### `manage_memory`
Manage persistent, workspace-aware memory across sessions.
- `search`: Find prior decisions or research findings.
- `clear`: Flush all cached memory for a workspace.

---

### `store_workspace_skill`
Save structured knowledge and scripts into the workspace.
- `name`: Lowercase-hyphenated skill name.
- `what`: List of key decisions or implementation details.

---

### `browser_tool` [v1.0.8]
Owns a real, live `chrome-devtools-mcp` browser session per `sessionId` with a granular action surface — full reference in [browser_tool.md](../browser_tool.md).
- **Parameters**:
  - `action` (required): `navigate` | `snapshot` | `click` | `scroll` | `wait` | `evaluate` | `network` | `api_replay` | `extract` | `deep_scrape` | `screenshot` | `checkpoint` | `session` | `site_memory` | `scrape` (legacy one-call macro).
  - `url` (required for `navigate`/`scrape`; optional elsewhere): Target website URL.
  - `sessionId` (optional): Reuses a live pooled browser session + checkpoint across calls.
  - `params` (optional): Action-specific object — see [browser_tool.md](../browser_tool.md) for the per-action schema.
  - `userInstructions` (optional): Prompt/instructions for extraction actions.
  - `outputDir` (optional): Directory for exported datasets/checkpoints/network dumps.
  - `strict` (optional, default `true`): Extraction failures return `data: null` + errors instead of a best-effort guess.
- **How it Works**: `BrowserSessionPool` spawns/reuses a real `chrome-devtools-mcp` child process per session. Discovers interactive nodes purely by ARIA role/text, captures network response bodies via an injected interceptor, ranks/replays private API endpoints, detects Cloudflare/CAPTCHA block pages, persists pausable checkpoints, and flattens structured datasets.

---

### `cyber_tool`
Educational cyber security coach plus isolated security binary tool registry and dedicated wiki manager.
- **Parameters**:
  - `action` (required): `'list_tools'`, `'get_tool'`, `'register_tool'`, `'wiki_lookup'`, `'learn'`, `'coach'`, `'save_graph'`, `'load_graph'`, or `'tool_memory'`.
  - `toolName` (optional): Security tool name (e.g. `sqlmap`, `nmap`, `ffuf`).
  - `sessionId` (optional): Session/CTF-challenge id.
  - `goal` (optional): Natural-language objective for `learn`.
- **How it Works**: Manages dynamic security binary URL resolution and CTF decision-graph nodes in wiki namespace `ctf-graph/{sessionId}`.

---

### `index_workspace`
Proactively index all relevant files in the workspace for semantic search.

---

## 🧭 Prompting & Steering Directives

### 1. The `override` keyword (in-prompt, bypasses `.gitignore`)
Typing the literal word **`override`** anywhere in your prompt text tells the workspace context gatherer to **scan every file, including `.gitignore`d ones**.

```
"Check the override — read all files under dist/ for the compiled output"
```

### 2. Task-lane DSL prefixes (in-prompt, controls sequential vs. parallel subtasks)
- `>` — run this subtask **in parallel** with others.
- `-`, `*`, or `1.` — run this subtask **sequentially**.

```
> read auth.ts
> search for API keys
- implement new middleware
```

### 3. Persona auto-detection (in-prompt phrasing, changes context ranking and response style)
Scans prompt text for keywords to assign a persona (`debugger`, `researcher`, `student`, `marketer`, `planner`, `coder`, `generic`). Pin explicitly in `AGENTS.md`:
```
preferred persona: coder
```

### 4. The `keywords` parameter (API param, steers documentation & skill injection)
`keywords` is a `string[]` field on `use_free_llm` and `load_skill_prompt`. It is the primary signal for section-level prompt injection (`prompt.json`), wiki note matching, and skill search:

```json
{
  "messages": [{ "role": "user", "content": "Add rate limiting to the login endpoint" }],
  "keywords": ["security", "jwt", "rate-limit"],
  "agentic": true,
  "workspace_root": "c:/Users/mahes/project"
}
```

---

## ⚠️ Agentic Behavior & Limits

- **Subtask cap**: Pipeline executes at most **3 subtasks** per request.
- **Time budget & background execution**: Bounded by wall-clock budget (`MCP_SUBTASK_BUDGET_MS`, default 20s). Background runs can be checked via `"action": "status"` or resumed via `"action": "continue"`.
- **Pipeline Pause**: Pauses on terminal commands or subtask failure. Resume with `"action": "continue"`.
- **Agentic gate**: Set `ENABLE_AGENTIC_MIDDLEWARE=true` or pass `"agentic": true`.
- **`AGENTS.md` Workspace Rules**: Auto-loaded from workspace root or `.agents/AGENTS.md`.

---

## 📚 Deep Dives & References

- [**System Architecture**](references/architecture.md): Deep dive into grounding protocols, decoupled routing mechanics, and advanced agentic patterns.
- [**Skill & Sandbox Logic**](references/code-mode-logic.md): Guide to creating custom skills for `execute_skill` and QuickJS sandbox execution.
- [**Memory Usage Guide**](references/memory-usage.md): Architectural details of persistent memory, wiki structure, and PDF offset caching.
- [**Per-tool reference & usage docs**: `references/<tool>.md`.

---

## 🔍 Quick Agent Diagnostics & Dashboard

1. **Verify Server Health**: Call `validate_provider` with target provider (e.g. `groq`).
2. **Check Token Budgets**: Call `get_token_stats` to audit quota consumption.
3. **Monitor Visual Dashboard (`http://localhost:3000`)**: Open `http://localhost:3000` to view real-time latency, token usage by memory layer, `keywords[]` match highlights, and `agentic: true` vs `agentic: false` payload comparisons.
