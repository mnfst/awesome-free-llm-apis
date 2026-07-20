---
name: free-llms
description: "Orchestrate multiple free LLM providers, manage persistent workspace memory, and utilize keyword-based steering for project-specific reference extraction and various agentic workflows."
metadata:
  category: utility
  triggers: free models, llm cost, fallback, routing, token tracking, workspace memory, context-aware steering, reference extractor, keyword classification, project discovery, gemini, groq, cohere, cloudflare, deepseek, qwen, compression, execute skill, vision tool, agentic, reasoning, planning, subtask decomposition, pdf grounding, semantic wiki, adr tracking
---

# Free LLM APIs — Usage Guide

Discipline for orchestrating multiple free LLM providers via the `@mcp:free-llm-apis` MCP server.

> **v1.0.6 Update**: Decoupled routing layers, centralized task classification, and new `execute_skill` and `vision_tool` integrations.

---

## 🎯 When to Use

- **Cost-Effective Inference**: Use free frontier or mid-tier models instead of paid APIs.
- **Resilient Workflows**: Automatic fallback ensures completion even during rate limits.
- **Stateful Context**: Persist findings or decisions across multiple turns/sessions.
- **Architectural Steering**: Project-specific documentation or architectural maps guide implementation.

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

## 🛠️ Tool Reference

### `use_free_llm`
Perform chat completion with optional fallback and workspace memory.

> [!IMPORTANT]
> **MANDATORY PROJECT RULE**: For any workspace task, you MUST set `"agentic": true` AND provide `"workspace_root"`. This enables session memory and grounding.

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

### `load_skill_prompt` [NEW]
Search for or load a dynamic skill from the remote awesome-antigravity-skills index and save it locally.

- **Parameters**:
  - `type` (required): `"load"` to download/load a specific skill, or `"search"` to find skills.
  - `name` (required if type is `"load"`): The name or ID of the skill to load.
  - `keywords` (required if type is `"search"`): Array of string keywords to search for.
  - `workspaceDir` (optional): Absolute path to the workspace directory for local storage.
- **How it Works**: If type is `"search"`, queries the local index of skills matching keywords. If type is `"load"`, fetches all files of the target skill from GitHub, saves them to the local config/workspace directory, and returns the parsed `SKILL.md` system prompt ready for injection.

---

### `execute_skill` [NEW]
Execute a prompt using a specific local skill's instructions and reference files.

- **Parameters**:
  - `skill` (required): Name of the skill directory under `.free-llm-mcp/skills/` or the global config.
  - `input` (required): The prompt or instruction to run.
  - `model` (optional): Specific model override.
  - `workspace_root` (optional): Absolute path to the project root.
- **How it Works**: Automatically extracts relative file paths referenced in `SKILL.md` (e.g., `references/*.md`, `resources/*`), loads their contents, and injects them as system context before executing the model.

---

### `vision_tool` [NEW]
Analyze local images or remote image URLs.
- **Parameters**:
  - `image_path` (required): Absolute path or `file:///` URI to the local image.
  - `prompt` (optional): Text prompt accompanying the image.
- **How it Works**: Resolves Windows-specific paths (handling spaces and backslashes), converts the image to base64, and routes it to an available vision provider (e.g., Gemini or Llama-3.2-Vision).

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

### `index_workspace`
Proactively index all relevant files in the workspace for semantic search.

---

## 🧭 Prompting & Steering Directives

These are the mechanisms that change how a prompt is processed. They're independent of each other — a single request can use all four at once.

### 1. The `override` keyword (in-prompt, bypasses `.gitignore`)
Typing the literal word **`override`** (or `all files`, `gitignored`, `ignored`) anywhere in your prompt text tells the workspace context gatherer to **scan every file, including `.gitignore`d ones**, instead of the default tracked-files-only scan. Use this when you need the agent to see build output, `node_modules` config, `.env` templates, or other normally-excluded files.

```
"Check the override — read all files under dist/ for the compiled output"
```

This only affects which files are visible to context-gathering; it does not change model choice, persona, or task type.

### 2. Task-lane DSL prefixes (in-prompt, controls sequential vs. parallel subtasks)
Prefix individual lines of a multi-step prompt to force execution order — this takes precedence over the automatic planner's heuristics:
- `>` — run this subtask **in parallel** with others (auto-downgraded to sequential if two parallel tasks share the same classified `TaskType`, to avoid race conditions).
- `-`, `*`, or `1.` — run this subtask **sequentially**.

```
> read auth.ts
> search for API keys
- implement new middleware
```

### 3. Persona auto-detection (in-prompt phrasing, changes context ranking and response style)
The server classifies every prompt into a **persona** by scanning its raw text for phrase patterns (first match wins, checked in this order):

| Persona | Triggered by phrases like... |
|---|---|
| `debugger` | error, exception, bug, crash, stack trace, leak, broken, "why does", type error, undefined, null, failed, issue, schema, variable, parameter |
| `researcher` | `pdf://`, paper, citation, arxiv, research, study, thesis, literature |
| `student` | "explain how", "how to", tutorial, "what is", learn, teaching, concept |
| `marketer` | seo, marketing, campaign, keyword, traffic, ad |
| `planner` | plan, roadmap, timeline, milestone, phase, step |
| `coder` | implement, refactor, class, function, method, interface, module, compile, run, build, test, package.json, tsconfig.json |
| `generic` | (fallback — none of the above matched) |

`debugger` is checked first (its patterns are broad on purpose — debugging sessions need the widest context), `coder` last before the fallback. The detected persona re-ranks which workspace files/wiki entries are considered relevant (e.g. `researcher`/`student` favor theoretical/reference material over implementation files) and, for `debugger`, appends token-efficient CLI-reading tips to the response.

**Pin a persona explicitly** by adding a line to your workspace's `AGENTS.md` — this always wins over heuristic detection:
```
preferred persona: coder
```

### 4. The `keywords` parameter (API param, steers *documentation section* selection — not persona)
`keywords` is a `string[]` field on `use_free_llm` (and `load_skill_prompt`'s search mode) — **not** something you type inside the prompt text. It's a separate, explicit steering signal that boosts which sections of injected reference documentation get prioritized/kept when the system prompt is assembled (each matching section gets a scoring boost). It has no effect on persona or task-lane routing.

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

- **Subtask cap**: The pipeline executes at most **3 subtasks** per request. For larger plans, break your request into multiple calls or use the `continue` resume command.
- **Pipeline Pause**: If a subtask requires a terminal command, execution pauses and you will receive a `⚠️ Pipeline Paused` message. Reply with `continue <PROMPT_ID> <output>` to resume.
- **Agentic gate**: Set `ENABLE_AGENTIC_MIDDLEWARE=true` in the server environment, or explicitly pass `"agentic": true` in your request to activate subtask decomposition.
- **`AGENTS.md` Workspace Rules**: The pipeline automatically detects and loads the `AGENTS.md` file located at the workspace root or under `.agents/AGENTS.md`. Use this file to define project-specific coding standards, behavioral rules, and model routing preferences that the agent must follow.

---

### 1. PDF-Based Learning & Visual Grounding
You can steer the agent to learn directly from local manuals, API specs, or datasheets by referencing specific pages using a `#page=N` hash:
- **Steering Syntax**: `Read the specification in [manual.pdf](file:///c:/project/docs/manual.pdf#page=12)`
- **Physical vs. Printed Offsets**: The server automatically manages a PDF Index Offset Cache (`pdf:index:<pdf_slug>`). If physical page 5 of the PDF corresponds to printed page 1, it caches an offset of `4`. The server will automatically translate your requested printed page number `12` to physical page `16` before extraction.
- **Visual Grounding**: The server extracts the page text via `PyMuPDF` and renders the page to a base64 image. Both are injected directly into the LLM context.
- **Offset Verification**: If a PDF's offset is incorrect, you can manually update the offset cache using `store_workspace_skill` with the key `pdf:index:<pdf_slug>` and value `{"offset": N}`.

### 2. Semantic Wiki Maintenance & ADR Tracking
The server maintains a structured wiki under `.free-llm-mcp/wiki/` containing markdown files with YAML frontmatter. This is your project's "truth engine" for architectural decisions.
- **ADR Auto-Extraction**: The system scans all completed subtask outputs for decision patterns. When it detects phrases like `"decided to"`, `"chose X over Y"`, or `"decision:"`, it automatically extracts them into a structured Architecture Decision Record (ADR) file in the wiki (e.g., `adr_001.md`).
- **Manual ADR Maintenance**: To ensure the agent respects architectural boundaries, you can manually write or update ADR files in `.free-llm-mcp/wiki/`. Use the following format:
  ```markdown
  ---
  title: use_redis_session_store
  tier: semantic
  tags: [architecture, adr, database]
  links: [session_id]
  adr_ref: adr_001
  ---
  # ADR 001: Use Redis Session Store
  We decided to use Redis for session management instead of JWT tokens because of performance overhead.
  ```
- **Attestation**: During workspace indexing, the agent reads these ADRs and cross-references them against your source files. If a code change violates an active ADR, the agent will flag a warning.

---

## 📚 Deep Dives & References

- [**System Architecture**](references/architecture.md): Deep dive into grounding protocols, decoupled routing mechanics, and advanced agentic patterns.
- [**Skill & Sandbox Logic**](references/code-mode-logic.md): Guide to creating custom skills for `execute_skill` and how the internal QuickJS sandbox executes code.
- [**Memory Usage Guide**](references/memory-usage.md): Architectural details of the persistent memory system, wiki structure, and PDF offset caching.
- [**Documentation Maintainer**](references/doc-maintainer.md): Context-aware best practices for codebase documentation.
- [**System Tool Usage Matrix**](references/usages.md): Full test matrix with actual responses and latency measurements.

---

## 🔍 Quick Agent Diagnostics

If a tool call fails or returns an error, follow this sequence:
1. **Verify Server Health**: Call `validate_provider` with the target provider (e.g., `groq`) to check connectivity.
2. **Check Token Budgets**: Call `get_token_stats` to see if a provider is rate-limited or lacks credentials.
3. **Monitor Visual Dashboard**: Inform the user they can view real-time latency and token statistics on the local dashboard at `http://localhost:3000` (if running in SSE mode).

> [!WARNING]
> **Consecutive Subtask Failures**: If the agent experiences consecutive failures during execution, it is likely due to:
> 1. **Invalid or Missing API Keys** for the selected provider.
> 2. **Lack of Active Reasoning/Planning Providers** configured in the server. Reasoning models are required to decompose goals into subtasks.
>
> Ensure at least one of the following reasoning/planning providers is active with valid credentials:
> 
> ```text
> --- 5. REASONING / PLANNING PROVIDERS ---
> (Crtical for agentic subtask decomposition)
> 
> huggingface
> modelscope
> github-models
> gemini
> openrouter
> nvidia
> ```
