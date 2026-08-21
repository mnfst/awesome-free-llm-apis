# Changelog

## v1.1.0 – Upstream Free Model Catalog Synchronization, Anti-Flagging Cyber Routing, Cerebras Deprecation & Planning Provider Hardening (August 2026)

### 🚀 Highlights

- **Upstream Catalog Sync & Deprecation Harmonization**:
  - Merged upstream `data.json` updates and verified free tier availability across all supported providers.
  - Fully deprecated **Cerebras** (mandatory credit card requirement) and cleaned out deprecated models across Groq, Mistral, LLM7, and OpenRouter.
  - Added new live models for NVIDIA NIM (`nemotron-3.5-lightning-30b-a3b`, `muse-glimmer-30b`, `glm-5.2`, `minimax-m3`, `diffusiongemma-26b-a4b-it`, `nemotron-3-ultra-550b-a55b`, `nemotron-3-nano-omni-30b-a3b-reasoning`, `deepseek-v4-flash-0731`), Kilo Code (`tencent/hy3:free`, `liquid/lfm-2.5-2.6b:free`, `nvidia/nemotron-3.5-lightning:free`), and Groq (`groq/compound`, `groq/compound-mini`, `qwen/qwen3.6-27b`).
- **Anti-Flagging & Low-Refusal Cybersecurity Routing**:
  - Prioritized unaligned / low false-positive refusal models (`z-ai/glm-5.2`, `deepseek-ai/deepseek-v4-flash-0731`, `tencent/hy3:free`, `nvidia/nemotron-3.5-lightning-30b-a3b`) in `TaskType.Cyber` to prevent refusal hurdles during authorized defensive security research and telemetry analysis.
- **Provider & Model Diagnostics Reconciliation**:
  - Updated `MODEL_METADATA` and `TextRouterMiddleware` task maps, achieving 0 orphaned models and 0 underutilized provider entries across all 11 task categories.
  - Proactively pruned upcoming August 24, 2026 expiring models from OpenRouter (`nvidia/nemotron-3-nano-30b-a3b:free`, `nvidia/nemotron-nano-12b-v2-vl:free`, `nvidia/nemotron-nano-9b-v2:free`).
- **Documentation Hardening**:
  - Updated `SKILL.md` reasoning/planning provider rankings based on verified live model counts (`nvidia` 7 models, `openrouter` 4 models, `kilocode` 3 models, `huggingface` 2 models, `cloudflare` 1 model, `cohere` 1 model, `gemini` 1 model, `modelscope` 1 model).

---

## v1.0.9 – SearchRouterMiddleware, Cyber/Quantum Tool Graphs, Hermes Skills, Local LLM Patch & Browser Snapshot Diffing (August 2026)

### 🚀 Highlights

- **`SearchRouterMiddleware`** (`src/pipeline/middlewares/SearchRouterMiddleware.ts`): search-classified `use_free_llm` tasks now fall back through Parallel AI → Tavily → Jina → Brave → SearXNG (self-hosted, terminal fallback) instead of routing search through a general chat model. Each provider (`src/search/providers/*.ts`) implements the existing `BaseProvider` circuit-breaker (429 → flat cooldown, 5xx → exponential backoff), normalized into a shared `UnifiedSearchResult[]`. Every query is logged (fire-and-forget) to a new Firestore `search_logs` collection via `logSearchQuery` (`src/utils/firebase.ts`) and rendered on the dashboard's Providers tab — full result lists (not truncated previews) behind a `<details>` dropdown per query, mirroring the existing subtask-context dropdown pattern.
- **`cyber_tool` task-graph visualization**: `GET /api/cyber_tool/task_graph/:sessionId` (`src/server.ts`) surfaces the CTF decision graph (`goal/hypothesis/action/finding/deadend` nodes) that `save_graph`/`load_graph` already persisted — no new graph format, purely a dashboard rendering gap closed. Rendered in the Wiki tab, grouped into columns by `ctfType`.
- **Hermes Skills integration**: `external/hermes/` bundles 36 real skills fetched once from `github.com/nousresearch/hermes-agent` (`scripts/fetch-hermes-skills.ts`, one-time bootstrap — committed to the repo, never fetched at request time). `execute_skill`/`load_skill_prompt` auto-detect Hermes skills alongside the existing workspace/global `agentic-awesome` skills (`source: 'hermes' | 'agentic-awesome'`), injecting an adapter note that steers the model toward this server's own tools instead of raw filesystem operations a Hermes skill might assume.
- **`quantum_tool`** (new): a multi-branch/persona HITL reasoning aid using quantum-circuit vocabulary as a metaphor — branch "confidence" is grounded in real single-qubit rotation math (`RY`/`RZ` recover and reapply `phi = 2*asin(sqrt(confidence))`; `Z`/`RZ` are correctly no-ops on measurement probability, not simplifications), with an `analyze` action that calls a real LLM to synthesize across branches. See [`references/quantum_tool.md`](docs/skill/references/quantum_tool.md).
- **`local_llm_patch`** (new, standalone — not yet wired into MCP/server): a single-file patch stub against a genuinely local Ollama server (`src/providers/ollama-local.ts`, `http://localhost:11434`, no auth). Candidate models are *ranked* by coding-oriented naming, never *filtered* by name — whether a model can actually serve `/api/chat` (as opposed to being embedding-only) is only knowable by trying it for real, so the tool tries ranked candidates in order and treats a real API failure as the only valid signal to fall through to the next one. See [`references/local_llm_patch.md`](docs/skill/references/local_llm_patch.md) for the full non-goals list (no multi-file patches, no dataflow analysis, no `repo_graph.json` semantic RAG, no auto-apply — all deferred to v1.1.0's full `coding_agents`).
- **Browser snapshot structural diff**: `src/browser/SnapshotDiffer.ts` parses `take_snapshot`'s flat accessibility-tree text into an id-keyed node list and diffs two snapshots the same way `src/memory/graph-diff.ts` diffs repo graphs. `click` now attaches a `domDiffSummary` (e.g. `"+22 nodes mounted under \"Lineups\""`) whenever the DOM changed; `wait until:'dom-stable'` emits one summary diff on exit without adding cost to its 300ms polling loop. `BlockDetector` gained a second, structural interstitial signal (a near-total top-level wipeout replaced by a small added set) alongside its existing text-marker scan. `DomStateFingerprinter`, previously duplicated between `BrowserSession.ts` and `browser-action.ts`, is now defined once.
- **Firebase identity-churn fix**: `exchangeRefreshToken()` had no retry logic and silently minted a brand-new anonymous account on any transient network failure during token refresh. It now retries with backoff (matching the pattern already used by `getUserStats()`/`getLeaderboard()`), logs the real HTTP rejection reason, and warns explicitly when falling through to a new account despite having saved credentials.
- **`docs/` reference refactor**: `references/usages.md` split into one `.md` file per tool (`references/use_free_llm.md`, `references/browser_tool.md`, `references/cyber_tool.md`, `references/quantum_tool.md`, `references/local_llm_patch.md`, etc.), linked individually from `SKILL.md` so the skill doc stays focused on agentic workflow guidance rather than a growing test matrix.
- `empero-ai/Qwythos-9B-Claude-Mythos-5-1M` confirmed present in the HuggingFace provider list and reachable via `TextRouterMiddleware` routing (verify-only, no code change needed).

### Next updates (→ v1.1.0)

- **Firebase Auth hardening** (password-based login for the dashboard/MCP server, moving cached tokens from in-memory to a credential file): scoped in the original v1.0.9 plan but pushed out — the identity-churn bug above was fixed as a smaller, isolated correction instead of bundling it with the larger auth-hardening rework. Could be avoided if username based IDOR vulnerability is potentially exploitable, so the fix is deferred to v1.1.0. [Note: This mechanism should be reterospected to analyse the feasibility by a test driven approach to look out for vulnerabilities, implement only if found necessary.]
- `local_llm_patch` MCP/server wiring (`src/mcp/index.ts` tool registration, `POST /api/local_llm_patch`, dashboard Tool Playground entry) — the tool itself is implemented and tested but intentionally left unwired pending explicit sign-off on exposing a local-only, unauthenticated code-patching surface.
- Full `coding_agents`: multi-file patches, LSP-grounded dataflow analysis, diff-preview in dashboard, and `local_llm_patch` MCP/server wiring. (ref. omp impplementation via context7 mcp for development and testing)
- `repo_graph.json` → `VectorStore` semantic RAG for coding agents, and LSP-grounded variable-level dataflow analysis — both explicitly out of scope for the single-file `local_llm_patch` granularity; real, separately-scoped work for v1.1.0's full `coding_agents`.
- `extract`/`deep_scrape` subtree-targeting via the new snapshot diff (mapping a diffed node back to a DOM selector) — the diff shape needs to prove out on `click`/`wait` first.
- New 'researcher' persona some refs in the middleware already, should leverage the free search and the broser_tool diff mechanism to understand the changes in the DOM and also to be able to understand the site contents including research papers. (In depth semantic understanding and response and user can skip certain sites or ask for more information based on the research paper contents.)
- `osint` tool (new) — a multi-step OSINT workflow that uses `search_tool`, `cyber_tool`, and `browser_tool` to gather information about a target domain, IP, or individual. The tool will be able to perform WHOIS lookups, DNS enumeration, subdomain discovery, and other OSINT techniques. To be integrated in the `cyber_tool` itself.
- Full in-depth use case testing of all tools including agentic middleware and its activations.
- Reterospect the user faclitation for the inclusion of audio/text/video generation tools using the free llm providers OR Improve the dashboard UI to improve the tool calling, rather than clicking on buttons, the user should be given an i button to know how to run the tools all alone.

---

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

### Next Updates (v1.0.9, shipped — see the v1.0.9 section above for what actually landed)

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
- Firebase persistance for both mcp and dashboard should be established rather than key rotation.(If needed we can use password based login for firebase and also we can use the firebase auth to login to the dashboard and also to the mcp server.) **→ Deferred to a future release** (see v1.0.9 section above); a smaller, isolated identity-churn bug was fixed instead.
- ~~`coding_agents` tool~~ **→ Deferred to v1.0.9**: Scope split into:
  - v1.0.8: `browser_tool` + `cyber_tool` file-locked userprofile registry foundation
  - v1.0.9: `local_llm_patch` stub (Ollama-driven single-file patching) (Done, unwired — see v1.0.9 section above)
  - v1.1.0: Full `coding_agents` with LSP grounding + diff preview
- [Hermes Skills Integration](docs/plans/hermes-agent-skills.md) – fetch, index, and execute remote skills from the `hermes-agent` repo. (Done)
- `quantum_tool` - new tool for quantum cirtuit based reasoning for reseatch purposes. (Done)
- 'docs/' refactor: 'references/' should maintain different .md files for each tool, remove the usages.md and architecture.md and move the relevant content to the tool-specific .md files, so that the SKILL.md remains lightweight and focused on the agentic workflow, and the tool-specific .md files can be used as a reference for the tools and their usage. (Done — `usages.md` split; `architecture.md` kept as-is, since it documents cross-cutting pipeline mechanics rather than a single tool.)
- **Browser snapshot diff understanding mechanism**: `wait until:'dom-stable'` and the click/pagination-loop guards currently only know two things about a DOM state transition — did the sha256 fingerprint change, yes/no (`DomStateFingerprinter.hasStateChanged`). That's enough to detect a no-op click but not enough to explain *what* changed, so the LLM re-derives it from a full new snapshot every time. (Done — see v1.0.9 section above.)
- **GitHub Models provider fully deprecated**: Removed `GitHubModelsProvider` from `ProviderRegistry` (persistent instability / recurring "scheduled retirement brownout" outages made it unreliable for routing). Provider class kept in `src/providers/github-models.ts` for reference only, marked `@deprecated`. Also dropped its `data.json`/README entries, dashboard row, skill-doc mentions, `TextRouterMiddleware` low-cost-provider entry, `update-models.ts` scraper wiring, and dedicated smoke-test script.

### Next Updates (→ v1.1.0)

- Full `coding_agents`: multi-file patches, LSP-grounded dataflow analysis, diff-preview UI, and `local_llm_patch` MCP/server wiring.
- `repo_graph.json` → `VectorStore` semantic RAG for coding agents (embedding generation, cache invalidation on graph changes, new retrieval API).
- Firebase Auth hardening: `signInWithPassword()`, credential file persistence under `~/.free-llm-mcp/`, dashboard login form.
- `extract`/`deep_scrape` subtree-targeting via `SnapshotDiffer` (map a diffed node back to a DOM selector).

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