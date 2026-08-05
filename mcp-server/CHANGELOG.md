# Changelog

## v1.0.8 – Dynamic Intelligent Browser Scraper, Cyber Tool Registry, File-Lock Concurrency & Flat Schema Exports (July 2026)

### 🚀 Highlights

- **100% Dynamic Browser Scraper (`browser_tool`)**:
  - Implemented domain-agnostic `DynamicNodeAnalyzer` to discover interactive ARIA buttons and category tabs with zero hardcoded class strings.
  - Added quantified scroll depth observation (`0%` to `100%` bottom fold) and state monitoring.
  - Created `ScrapingSessionCheckpointManager` allowing users to pause, inspect frontend findings, select depth options, and resume sessions across process restarts.
  - Created `ScriptPersistenceManager` to save generated JS extraction functions to `data/scrapes/scripts/` for 0-token LLM context cost on subsequent runs.
  - Implemented `UniversalTabularSchemaFlattener` to dynamically flatten deeply nested JSON graphs into flat CSV rows (`startX`, `startY`, `endX`, `endY`, `outcome`).

- **`browser_tool` now owns a real browser session end to end.** The scaffolding above wasn't actually reachable: `scrapeAndProcessWithCheckpoint` was always invoked with `devtoolsEvalResponse: null` and no `mcpClient` from both `src/mcp/index.ts` and `POST /api/browser_tool`, so the tool silently exported zero records while reporting `success: true`. `src/browser/BrowserSessionPool.ts` now spawns and reuses a `chrome-devtools-mcp` session per `sessionId`, with LRU eviction, an idle reaper, and a cached-failure path so a broken engine returns a structured error instead of throwing or retrying a slow `npx` spawn on every call.
- **New action surface** (`src/browser/actionSchemas.ts`, `src/browser/dispatch.ts`): `navigate, snapshot, click, scroll, wait, evaluate, network, api_replay, extract, deep_scrape, screenshot, checkpoint, session`. One zod registry now generates both the MCP `inputSchema` and the runtime validation, closing the drift where `domainContext`/`filenameBase`/`deepScrapeLimit`/etc existed on `BrowserScrapeInput` but were never reachable over MCP. `action: 'scrape'` and `action: 'list_checkpoints'` remain supported as back-compat aliases.
- **Network body capture + private-API replay**: an injected fetch/XHR interceptor (`src/browser/interceptor.ts`) captures response bodies chrome-devtools-mcp's own `list_network_requests` doesn't expose, and `EndpointRanker`/`EndpointTemplater` (`src/browser/EndpointRanker.ts`, `EndpointTemplater.ts`) score discovered endpoints and mine id values from observed traffic/DOM instead of requiring them to be hardcoded.
- **Strict mode by default**: `interpretExtractedDataWithLLM` in `src/tools/browser-action.ts` no longer synthesizes plausible-looking `{id, title, link}` records when the LLM's output fails to parse — it now retries once with a corrective prompt, then reports `status: 'failed'` with a structured error. `success: true` with zero records is no longer possible without an explicit evidenced-empty-page warning.
- **Cloudflare/CAPTCHA block detection + Firebase logging**: `src/browser/BlockDetector.ts` scans snapshot text for known Cloudflare-interstitial and CAPTCHA markers on every `snapshot()` call. When a scrape action (`extract`, `api_replay`, `click`) fails on a page that's actually a challenge wall, the result now says so explicitly (`BLOCKED_BY_CLOUDFLARE` / `BLOCKED_BY_CAPTCHA`) instead of reporting a generic empty result, and the obstruction is fire-and-forget logged to a new `scraping_failures` Firestore collection via `logScrapingFailure` (`src/utils/firebase.ts`) — separate from the general `errors` collection so these are filterable on the dashboard.

- **Isolated Cyber Security Tool Registry (`cyber_tool`)**:
  - Created process-safe `CyberToolsRegistry` storing security binary mappings in userprofile path `~/.free-llm-mcp/cyber-tools-registry.json`.
  - Enforced atomic file-locking (`.lock`) synchronization to prevent multi-agent race conditions during concurrent tool registration.
  - Isolated security tool command flags and WAF/IPS troubleshooting logs within the dedicated `global-cyber-tools` wiki namespace.

- **Granular Step Logging & Web Dashboard Integration**:
  - Integrated Phase 3 `ChatLogger.logToolCall` across every step of `browser_tool` (`explore_surface_area`, `discover_nodes`, `click_node`, `save_checkpoint`, `load_checkpoint`, `list_checkpoints`, `scrape_and_process`) and `cyber_tool` (`list_tools`, `get_tool`, `register_tool`, `wiki_lookup`).
  - Added `browser_tool` and `cyber_tool` to `src/server.ts` express endpoints (`POST /api/browser_tool`, `POST /api/cyber_tool`), interactive Tool Playground dropdowns, and Quick Start accordions on the Web Dashboard.

- **Unit & Integration Testing Hardening**:
  - Achieved 100% green test status across 16/16 unit test suites (`npx vitest run`).

### Next Updates (→ v1.0.9)

- Add `empero-ai/Qwythos-9B-Claude-Mythos-5-1M` to HuggingFace provider list and `TextRouterMiddleware` routing. (Done)
- Migrate the search_tool call from gemini to route these in a `SearchRouterMiddleware` to free search providers like SearXNG, Jina, Tavily, Brave Search, Exa, Perplexity, and Parallel. The routing should be based on the availability of the free tier and the rate limits of each provider:

  | Provider     | Free Tier               | Notes |
  |--------------|-------------------------|-------|
  | **SearXNG**  | ✅ Free                 | Open-source meta-search engine. You self-host it, so there is no per-query cost. The most "free" option here. |
  | **Jina**     | 🟡 Limited free         | Offers a free tier/rate limit for its Reader/Search endpoints; paid beyond that. |
  | **Tavily**   | 🟡 Free tier            | Provides a free plan with limited monthly credits, then usage-based pricing. |
  | **Brave Search** | 🟡 Free tier        | Free API plan with rate limits; paid plans available for higher usage. |
  | **Exa**      | 🟡 Free tier            | Offers a free developer tier, then usage-based pricing. |
  | **Perplexity** | 🟡 Free / Experimental | Sonar API may have experimental/free access, but it is generally a paid API requiring an API key and credits. |
  | **Parallel** | 🟡 Depends              | According to the `omp.sh` documentation, Parallel is listed, but each source is configured individually; there is no clear general free tier. |
- `cyber_tool` should be properly logged/task graph should be rendered with search and visualization.
- Firebase persistance for both mcp and dashboard should be established rather than key rotation.(If needed we can use password based login for firebase and also we can use the firebase auth to login to the dashboard and also to the mcp server.)
- ~~`coding_agents` tool~~ **→ Deferred to v1.0.9**: Scope split into:
  - v1.0.8: `browser_tool` + `cyber_tool` file-locked userprofile registry foundation
  - v1.0.9: `local_llm_patch` stub (Ollama-driven single-file patching)
  - v1.1.0: Full `coding_agents` with LSP grounding + diff preview
- [Hermes Skills Integration](docs/plans/hermes-agent-skills.md) – fetch, index, and execute remote skills from the `hermes-agent` repo.
- `quantum_tool` - new tool for quantum cirtuit based reasoning for reseatch purposes.
- 'docs/' refactor: 'references/' should maintain different .md files for each tool, remove the usages.md and architecture.md and move the relevant content to the tool-specific .md files, so that the SKILL.md remains lightweight and focused on the agentic workflow, and the tool-specific .md files can be used as a reference for the tools and their usage.
- **Browser snapshot diff understanding mechanism**: `wait until:'dom-stable'` and the click/pagination-loop guards currently only know two things about a DOM state transition — did the sha256 fingerprint change, yes/no (`DomStateFingerprinter.hasStateChanged`). That's enough to detect a no-op click but not enough to explain *what* changed, so the LLM re-derives it from a full new snapshot every time. Planned: a real structural diff between the previous and current snapshot (added/removed/mutated accessibility nodes, not just a hash flip) so `click`/`wait`/`deep_scrape` can report *what* appeared (e.g. "a Lineups panel with 22 player rows mounted") instead of only *that* something did, and so `extract` can target just the newly-mounted subtree instead of re-scanning the whole page. Also intended to give the Cloudflare/CAPTCHA block detector (above) a second, structural signal — a whole subtree swapped for a single interstitial widget — independent of the current text-marker scan.
- **GitHub Models provider fully deprecated**: Removed `GitHubModelsProvider` from `ProviderRegistry` (persistent instability / recurring "scheduled retirement brownout" outages made it unreliable for routing). Provider class kept in `src/providers/github-models.ts` for reference only, marked `@deprecated`. Also dropped its `data.json`/README entries, dashboard row, skill-doc mentions, `TextRouterMiddleware` low-cost-provider entry, `update-models.ts` scraper wiring, and dedicated smoke-test script.

---

## v1.0.7 – Wiki, Log Compaction, Process Locking, Dynamic Tokens, PDF Indexing + Testing Hardening (July 2026)

### 🚀 Highlights

- **Semantic Log & JSON Compaction**: Implemented a Jaccard-similarity-based compactor in context gathering middleware for large `.log` and `.json` files. Anchors the first 5 lines (head) and last 5 lines (tail), grouping intermediate lines/JSON blocks and collapsing identical or highly-similar entries using a Jaccard threshold (configured via `LOG_COMPACTION_THRESHOLD`).
- **Code Block Preservation**: Enhanced Jaccard calculations to explicitly bypass and preserve code elements like `jsCode` and `pythonCode` fields inside nested workflow JSON files.
- **Strict Vision Task Debugger Bypass**: Resolved issues where prompts with error keywords routed to vision models triggered debugger diagnostics, strictly restricting the injection of local PowerShell/Bash diagnostics to non-vision tasks.
- **Dynamic Search Limit Adjustments**: Bumped the search match limit to `50` for `.log`/`.json` files (from a default of `10`) to guarantee compaction logic is triggered.
- **Search Robustness**: Appended `-H` to `rg` and `--with-filename` to `grep` calls inside the search executor to ensure stable filename path-splitting on both Windows and POSIX environments.
- **Process-Safe Exclusive File Locking**: Implemented atomic concurrency control in `src/utils/file-lock.ts` holding exclusive `wx` lock files with OS-level PID existence checks and 30-second stale age reaping to prevent database corruption during parallel indexing.
- **Incremental PDF-Wiki RAG & Vision Indexing Pipeline**: Added a pipeline that renders pages, filters out small logos or thin divider lines (<40pt), upscales diagrams to 300 DPI, and injects rolling context into vision calls.
- **Proportional Per-Page Budget Truncation**: Replaced heuristic markdown-based semantic compression with a deterministic proportional budget divider (`batchRawMaxChars / numPages`) to balance prompt space fairly across pages.
- **Dynamic Output Token Budgeting**: Implemented model output `max_tokens` scaling based on first-pass creation/update states, batch page multipliers, and existing summary retention floors. Bounded vision calls dynamically between 100 and 500 tokens based on region size and context.
- **Confused User Query Interception**: Automatically detects empty/boilerplate prompts or file-only attachments to:
  - Reverse model fallback order (testing cheaper/faster models first like `gemini-3.1-flash-lite` to save budget).
  - Append guiding system instructions.
  - Set `skipIndexing = true` to bypass wiki maintenance and indexing runs.
- **Project-Scoped Wiki & RAG Integration**: Developed a persistent repository-scoped wiki system (`src/memory/wiki.ts`) integrated with vector semantic storage (`src/memory/vector.ts`) to maintain structured knowledge and documentation.
- **GitHub Repository Scanner & Analyzer**: Implemented `src/utils/GithubRepoScanner.ts` to fetch remote repository nodes, parse dependencies/imports, trace function flow, and dynamically index discovered tools.
- **Global Wiki Namespace for Cyber Tools**: Standardized the `global-cyber-tools` shared wiki namespace across workspaces, gating tool validation via known cyber binaries (`sqlmap`, `nmap`, `wireshark`, etc.).
- **Automatic Wiki Maintenance & Graph-Diff Linkage**: Built an event-driven maintainer (`src/memory/wiki-maintainer.ts`) that listens to repository file diff changes and parses import dependencies to automatically mark wiki pages stale when referencing code symbols are deleted.
- **Robust Integration Test Suite**: Created `tests/log-compaction.test.ts` (unstructured logs/metrics JSON), `tests/file-lock.test.ts` (concurrency/stale PID/timeout rules), `tests/wiki-memory.test.ts` (confidence promotion/eviction limits), and updated `tests/pdf-vision-helper.test.ts`, `tests/pdf-wiki.test.ts`, and `tests/task-routing-matrix.test.ts`.

### Next Updates

- `browser_action` tool to be integrated with `use_free_llm` for browser automation tasks, leveraging `chrome-devtools-mcp` for headless browser control. Github scraping should be used to extract relevant information from repositories, and the tool should be able to handle dynamic content loading and pagination.
- Migrate the firebase debugging to the 'chat-logs.json' instead of separate files.
- Assess migration to stream mode for supported providers to reduce latency and token wastage on long responses.
- `coding_agents` tool(not a one shot) which uses ollama driven local coding agents which has middleware acess to the workspace and can be used to generate code snippets, refactor code, and also to be able to understand the codebase and apply patches and preview diffs based on quantum based reasoning loops with lsp server integration for code understanding.
- Present cyber library indexing should be retained but is misleading, it should be dynamic for all library and the wiki should be updated based on success and feedback from the tool runs.
- `cyber_agents`tool a separate cyber routing middleware, which is isolated from the main routing middleware and can be used to handle cyber security related tasks. Dynamic tool dictionary(key: tool name, value: github_url) rather than a list of commonly used tools.

---

## v1.0.6 – Vision, Skill Loading, Privacy Hardening + Provider/Routing Updates (May 2026)

### 🚀 Highlights

- Removed Kluster provider from runtime registration and environment/config usage.
- Added `vision_tool` for `file:///` workspace-local image analysis routed through `use_free_llm`.
- Added dynamic `load_skill_prompt` tool for remote skills index loading and integrated optional skill prompt injection via `use_free_llm.skill`.
- Hardened outbound privacy redaction for LLM-bound payloads (keys/tokens/emails/phones/cards/JWT/bearer strings).
- Added tool-call interception in `use_free_llm` to execute recognized tool-call payloads server-side and continue conversation.
- Hardened skill script generation with explicit delimiters (`@@@SKILL_SCRIPT_START@@@` / `@@@SKILL_SCRIPT_END@@@`), `.py` filename normalization, and metadata headers.
- Enforced Markdown-formatted output for `use_free_llm` and `free_llm_api`.
- Added line-by-line cosine similarity (TF-IDF based) in memory manager and workspace-index integration for similar-file diff summaries.
- Replaced fixed fallback `max_tokens` behavior with model-weighted token sizing utility.
- Updated Hugging Face routing behavior to treat it as credit-based and deprioritize it versus fully-free alternatives.
- Added `execute_skill` tool for executing prompts grounded in local skill instructions and reference files.
- Added `vision_tool` for analyzing local images or remote image URLs and pdf files with optional text prompts.
- Refactored providers and added 'modelscope' provider for free LLM access with dynamic model selection.
- Firebase telemetry integration for error monitoring, usage tracking, and alerting on anomalous patterns and dashboard setup to run all the tools as a chat interface. (Chat interface and conversation history is ther but tool call history is lacking and needs to be implemented in the next update.)

### 🔄 Refactoring & Robustness (Phases 1–5)

- **Decoupled Routing Layer**: Split the monolithic `IntelligentRouterMiddleware` into specialized `TextRouterMiddleware` and `ImageRouterMiddleware`.
- **Centralized Task Classification**: Created `TaskClassifier.ts` to house all prompt classification heuristics, improving execution speed and preventing vision model routing for text-based tasks.
- **Consolidated Middleware Directories**: Moved all middleware files from `src/middleware/agentic/` and other directories into `src/pipeline/middlewares/` and standardized their naming (e.g., `AgenticMiddleware.ts`, `StructuralMiddleware.ts`).
- **Resilient File Operations**: Added a retry-rename loop with backoff in `FileUtils.ts` to mitigate Windows file-locking issues (`EPERM`/`EBUSY`) during concurrent atomic writes.
- **Benchmark Harness & Performance Tracking**: Upgraded `generate-live-samples.ts` to run fully isolated with a mocked `LLMExecutor`, profile memory, and output a performance table in `SAMPLES.md`.

### Next updates
- `AGENTS.md` should be injected during the decomposition phase(only / custom reading certain lines based on semantic understanding for subtasks) to provide agents with a reference of available tools and their usage.
- Dashboard refactors to include tool call history and conversation history in a single view with filtering and search capabilities.(Implemented)
- Reassess our architecture and apply fixes if required to make the system more robust and resilient to failures and also to make it more scalable and maintainable.
- Integrate a new TaskType 'cyber' to handle cyber security related tasks and also to be able to use the tools and models available in the `cyber_plan.md` to handle cyber security related tasks and also to be able to use the tools and models available in the `cyber_plan.md` to handle cyber security related tasks. (But tight keyword matching should be used to avoid false positives and also to avoid routing non-cyber tasks to the cyber models and tools.)
- Github repo scanning in middleware(if github urls are present) using githubusercontent and github api(Similar to the one implemented in `skill_loader`) to understand the working of the repo and also to be able to identify the dependencies between files and also to be able to identify the function calls across multiple files in a project and also to be able to identify the variable/dataflow across multiple files in a project.
- For cyber tools available in github we can maintain global wiki and update it based on sucess rate.
- Intelligent context extraction needs to corellate variable/dataflow or function calls across files and also to be able to identify the dependencies between. (eg. `jsCode` and `pythonCode` in n8n workflow json files [Our context extraction should know that it is a JavaScript code snippet that is a part of a workflow], or function calls across multiple files in a project,github actions workflow etc.)
- Wiki maintenance and update mechanism to be added to the middleware to keep the wiki up to date with the latest changes in the project and also to be able to add and relate them using a rag based mechanism.
- Wiki rendering with link clicking and also to be able to add and apply entanglement to the wiki as required.
- Conversation mechanism for all tools to be displayed in the dashboard with filtering and search capabilities.
