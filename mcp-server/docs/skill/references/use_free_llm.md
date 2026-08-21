# `use_free_llm`

**Purpose:** Send chat messages to any model with fallback support.

**Required params:** `messages`
**Key optional params:** `model`, `keywords`, `agentic`, `workspace_root`

### Invocation (project-scoped task)
```json
{
  "messages": [{ "role": "user", "content": "Implement auth in auth.ts" }],
  "agentic": true,
  "workspace_root": "/abs/path/to/project",
  "keywords": ["security", "jwt"]
}
```

### Response
- Content: `"Here is the JWT authentication implementation..."`
- Automatically injects directory structure, relevant grep snippets, and session memory context.

### Routing pipeline

`use_free_llm` runs through the pipeline defined in `src/pipeline/instances.ts`:
`StructuralMarkdownMiddleware → ResponseCacheMiddleware → WorkspaceContextMiddleware → AgenticMiddleware → ImageRouterMiddleware → SearchRouterMiddleware → TextRouterMiddleware`.

- **`ImageRouterMiddleware`** scans messages for `file:///` URIs; supported image formats (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`) are base64-encoded and routed to a vision provider. Text-only references pass through.
- **`SearchRouterMiddleware`** (`src/pipeline/middlewares/SearchRouterMiddleware.ts`, added v1.0.9) intercepts search-classified tasks before the general text router, falling back through Parallel AI → Tavily → Jina → Brave → SearXNG. Each provider implements `BaseProvider`'s circuit-breaker (`isAvailable()`/`recordFailure()`/`getPenaltyScore()` — 429 → flat 60s cooldown, 5xx → exponential backoff 10s/20s/40s capped at 60s). Results are normalized into `UnifiedSearchResult[]` and logged via `ChatLogger.logToolCall` + `logSearchQuery` (Firestore `search_logs` collection, rendered on the dashboard's Providers tab with a full-result `<details>` dropdown per query).
- **`TextRouterMiddleware`** uses `TaskClassifier.autoClassify` to infer task type (coding/reasoning/search/summarization/chat) via compiled regexes and a keyword-weight map, and triggers task decomposition for complex multiline goals.
