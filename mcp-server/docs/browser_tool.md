# 🌐 `browser_tool` — Real Browser Session Automation & Scraper

## Overview
`browser_tool` owns a real, live [`chrome-devtools-mcp`](https://www.npmjs.com/package/chrome-devtools-mcp) session per `sessionId` and exposes a granular action surface on top of it — navigate, click, scroll, wait, evaluate JS, capture/replay network traffic, extract structured data, take screenshots, and manage session/checkpoint lifecycle. It features **domain-agnostic ARIA node discovery**, **network body capture + private-API replay**, **Cloudflare/CAPTCHA block detection**, **strict extraction** (no silent empty-success), and **pausable session checkpointing**.

> **v1.0.8**: `browser_tool` now owns the session end-to-end. Previously `scrapeAndProcessWithCheckpoint` was always invoked with `devtoolsEvalResponse: null` and no live client from both `src/mcp/index.ts` and `POST /api/browser_tool` — the tool could report `success: true` while silently exporting zero records. `BrowserSessionPool` (`src/browser/BrowserSessionPool.ts`) now spawns and reuses an actual `chrome-devtools-mcp` child process per session.

---

## Requirements

- **Node.js >= 20** (needed by `chrome-devtools-mcp` itself, spawned via `npx -y chrome-devtools-mcp`).
- A locally installed Chrome/Chromium. If it isn't auto-discovered, set `CHROME_PATH` to its executable.
- No extra `npm install` step — `chrome-devtools-mcp` is fetched on demand via `npx` the first time a session starts (first call will be slower while `npx` fetches it).

---

## Action Surface

The full set is defined once in `src/browser/actionSchemas.ts` (`BrowserActions`) and used to generate **both** the MCP `inputSchema` and runtime validation — there's a single source of truth, so no action can drift out of sync with what's actually reachable.

| Action | Params (under `params: {...}`) | Purpose |
|---|---|---|
| `navigate` | `url` (required), `waitFor?`, `installInterceptor?` | Open a URL in the session; installs the network body-capture interceptor by default. |
| `snapshot` | `verbose?`, `includeState?`, `includeDepth?` | Accessibility-tree snapshot of the current page (zero hardcoded selectors — discovers interactive nodes by ARIA role/text/pointer-style). |
| `click` | `by` (`label`\|`role`\|`text`\|`uid`\|`selector`, required), `value` (required), `index?`, `scrollIntoView?`, `waitFor?` | Click an element found by the given strategy. |
| `scroll` | `target` (`window`\|`container`\|`element`, required), `selectorOrLabel?`, `to?` (`bottom`\|`top`\|`into-view`\|number), `steps?` | Scroll the window, a container, or into view of an element. |
| `wait` | `until` (`selector`\|`text`\|`network-idle`\|`dom-stable`\|`depth`\|`timeout`, required), `value?`, `timeoutMs?`, `pollMs?` | Wait for a condition before continuing. |
| `evaluate` | `function` (required, JS source), `args?` | Run a JS function in the page; returns a structured `{ok, data|error}` — never throws raw. |
| `network` | `op` (`list`\|`get`\|`drain`\|`clear`, required), `filter?`, `withBodies?`, `limit?` | List/get/drain/clear requests captured by the interceptor, optionally with response bodies (chrome-devtools-mcp's own `list_network_requests` doesn't expose bodies — see Network Capture below). |
| `api_replay` | `endpoints?` (string[] or `'auto'`), `idOverrides?`, `maxCalls?`, `flatten?`, `export?` | Rank discovered API endpoints (`EndpointRanker`), template/mine id values from observed traffic+DOM (`EndpointTemplater`), and replay them in-page. |
| `extract` | `strategy?` (`auto`\|`script`\|`api`\|`dom`), `script?`, `schemaHint?` | Extract structured records. **Strict by default** — see Strict Mode below. |
| `deep_scrape` | `limit?`, `linkFilter?` | Drain the pending-URL queue, visiting each discovered link and re-running the per-item extraction. |
| `screenshot` | `fullPage?`, `selectorOrLabel?`, `filename?` | Save a screenshot to disk; returns the file path only, **never base64** (keeps LLM context cheap). |
| `checkpoint` | `op` (`list`\|`load`\|`save`\|`pause`\|`resume`\|`delete`, required) | Manage on-disk session checkpoints — persists across process restarts. |
| `session` | `op` (`status`\|`close`, required) | Get status of, or close, the live pooled browser session. |
| `site_memory` | `op` (`read`\|`write`, required), `domain?`, `kind?`, `note?` | Read/write remembered per-domain endpoints, selectors, and labels (0-token reuse on subsequent runs against the same site). |
| `scrape` | *(passthrough)* | **Legacy** one-call macro: navigate → extract → export → checkpoint, kept for back-compat. Prefer the granular actions above for new integrations — they compose and are individually resumable. |

Top-level params alongside `action`:

| Param | Required? | Purpose |
|---|---|---|
| `action` | **required** | One of the actions above. |
| `url` | required for `navigate`/`scrape`; optional elsewhere | Target website URL. |
| `sessionId` | optional | Reuses a live pooled browser session + checkpoint across calls. Omit only for one-off stateless calls. |
| `outputDir` | optional | Directory for exported datasets, checkpoints, and network dumps. |
| `userInstructions` | optional | Prompt/instructions for extraction actions. |
| `strict` | optional, default `true` | When `true`, extraction failures return `data: null` + structured errors instead of a best-effort guess. |
| `params` | optional | Action-specific object — see the table above. |

---

## Key Subsystems

- **`BrowserSessionPool`** (`src/browser/BrowserSessionPool.ts`): process-wide singleton pool of live `chrome-devtools-mcp` sessions keyed by `sessionId`. `BROWSER_MAX_SESSIONS` (default `2`) caps concurrent live sessions with LRU eviction; `BROWSER_IDLE_TIMEOUT_MS` (default `300000`) reaps idle ones; a 60s cached-failure path means a broken engine returns a structured error instead of throwing or re-spawning a slow `npx` process on every call. A browser is **not** shareable across processes — the stdio MCP server and `POST /api/browser_tool` (HTTP mode) each keep their own pool; the on-disk checkpoint is the only cross-process handoff.
- **`BlockDetector`** (`src/browser/BlockDetector.ts`): scans snapshot text for known Cloudflare-interstitial and CAPTCHA markers on every `snapshot()` call. A scrape action (`extract`, `api_replay`, `click`) that fails on a page that's actually a challenge wall reports `BLOCKED_BY_CLOUDFLARE` / `BLOCKED_BY_CAPTCHA` explicitly (instead of a generic empty result), and fire-and-forget logs the obstruction to a `scraping_failures` Firestore collection (`logScrapingFailure`, `src/utils/firebase.ts`) — separate from the general `errors` collection so these are filterable on the dashboard.
- **Network interceptor** (`src/browser/interceptor.ts`): an injected fetch/XHR interceptor that captures response **bodies**, which chrome-devtools-mcp's own `list_network_requests` doesn't expose. Installed automatically on `navigate` unless `installInterceptor: false`.
- **`EndpointRanker` / `EndpointTemplater`** (`src/browser/EndpointRanker.ts`, `EndpointTemplater.ts`): score discovered API endpoints from captured traffic and mine id values from observed traffic/DOM, so `api_replay` doesn't require endpoints to be hardcoded.
- **`ScrapingSessionCheckpointManager`** (`src/tools/browser-action.ts`): persists session checkpoints (`INITIALIZED`, `SURFACE_EXPLORED`, `AWAITING_USER_SELECTION`, `PAUSED`, `RESUMED`, `COMPLETED`) to `data/scrapes/checkpoints/`. Lets a session be paused, inspected, and resumed — including across process restarts, via `checkpoint`'s `save`/`load`/`pause`/`resume` ops.
- **Strict mode** (`interpretExtractedDataWithLLM` in `src/tools/browser-action.ts`): no longer synthesizes plausible-looking `{id, title, link}` records when the LLM's extraction output fails to parse — retries once with a corrective prompt, then reports `status: 'failed'` with a structured error. `success: true` with zero records is not possible without an explicit evidenced-empty-page warning.
- **`UniversalTabularSchemaFlattener`**: dynamically flattens arbitrary nested JSON/coordinate arrays into flat CSV rows for export.

---

## 🛠️ Usage Examples

```typescript
// 1. Start a session and navigate
await client.callTool('browser_tool', {
  action: 'navigate',
  url: 'https://www.sofascore.com/football/match/coritiba-palmeiras/nOsHO#id:15237982',
  sessionId: 'match_exploration_v1'
});

// 2. Take a snapshot to discover interactive nodes
await client.callTool('browser_tool', {
  action: 'snapshot',
  sessionId: 'match_exploration_v1',
  params: { verbose: true }
});

// 3. Click a discovered tab
await client.callTool('browser_tool', {
  action: 'click',
  sessionId: 'match_exploration_v1',
  params: { by: 'text', value: 'Lineups', waitFor: { until: 'dom-stable' } }
});

// 4. Extract structured records (strict by default)
await client.callTool('browser_tool', {
  action: 'extract',
  sessionId: 'match_exploration_v1',
  userInstructions: 'Extract starting lineup with player name, position, shirt number',
  params: { strategy: 'auto' }
});

// 5. Pause and check on it later
await client.callTool('browser_tool', {
  action: 'checkpoint',
  sessionId: 'match_exploration_v1',
  params: { op: 'pause' }
});

// 6. Legacy one-call macro (back-compat)
await client.callTool('browser_tool', {
  action: 'scrape',
  url: 'https://www.sofascore.com/football/match/coritiba-palmeiras/nOsHO#id:15237982',
  userInstructions: 'Explore match statistics and player lineups',
  sessionId: 'match_exploration_v1',
  outputDir: 'data/scrapes'
});

// 7. List all active and paused checkpoints on disk
await client.callTool('browser_tool', {
  action: 'checkpoint',
  params: { op: 'list' }
});
```

---

## Environment Variables

| Var | Default | Purpose |
|---|---|---|
| `BROWSER_MAX_SESSIONS` | `2` | Max concurrent live pooled browser sessions before LRU eviction. |
| `BROWSER_IDLE_TIMEOUT_MS` | `300000` | Idle time before a pooled session is reaped. |
| `BROWSER_REPLAY_DELAY_MS` | `250` | Delay between replayed actions in checkpoint/session replay. |
| `CHROME_PATH` | *(auto-discovered)* | Override if Chrome isn't found automatically by `chrome-devtools-mcp`. |

---

## Related

- [Setup Guide](setup.md) — installation prerequisites.
- [Architecture & Workflow Guide](guide.md) — how `browser_tool` fits into the broader server, and note that it runs on its own session system independent of `AgenticMiddleware`'s subtask queue.
- `mcp-server/CHANGELOG.md` (v1.0.8) — full history of this expansion.
