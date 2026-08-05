# `browser_tool`

**Purpose:** Owns a real `chrome-devtools-mcp` browser session end to end — navigation, snapshotting, interaction, network-body capture, and structured scraping with pause/resume checkpoints.

**Action surface** (`src/browser/actionSchemas.ts`, `src/browser/dispatch.ts`): `navigate, snapshot, click, scroll, wait, evaluate, network, api_replay, extract, deep_scrape, screenshot, checkpoint, session` (`scrape`/`list_checkpoints` kept as back-compat aliases).

### Session lifecycle
`BrowserSessionPool` spawns and reuses one `chrome-devtools-mcp` client per `sessionId`, with LRU eviction, an idle reaper, and a cached-failure path so a broken engine returns a structured error instead of a slow retry.

### Block detection (`src/browser/BlockDetector.ts`)
Every `snapshot()` call scans the returned text for Cloudflare/CAPTCHA markers. A blocked `extract`/`api_replay`/`click` reports `BLOCKED_BY_CLOUDFLARE`/`BLOCKED_BY_CAPTCHA` instead of a generic empty result, and is fire-and-forget logged to Firestore's `scraping_failures` collection.

### Structural snapshot diff (added v1.0.9)
`take_snapshot` returns a flattened accessibility-tree text dump, not structured JSON — there's no in-memory node tree downstream. `src/browser/SnapshotDiffer.ts` parses that text into an id-keyed node list (`parseSnapshot`, keyed on `uid=` when present else a `role|label|depth` fallback) and diffs two snapshots (`diffSnapshots`, `summarizeDiff`) the same way `src/memory/graph-diff.ts` diffs repo graphs.

- `click` attaches `data.domDiffSummary` describing what changed (e.g. `"+22 nodes mounted under \"Lineups\""`) whenever the DOM fingerprint changed — computed from the before/after text already captured, not a new capture.
- `wait until:'dom-stable'` keeps its 300ms boolean-only polling loop untouched (no parse/diff cost added per tick) and only computes one summary diff on exit, comparing pre-wait vs. post-stable text.
- `BlockDetector` gains a second, structural signal: `looksLikeStructuralInterstitial()` flags a near-total top-level node wipeout replaced by a small added set (<5 nodes) — OR'd alongside the text-marker scan via `BrowserSession.applyStructuralSignal()`, for challenge walls that don't happen to contain a known marker string.
- `ScrapingSessionCheckpoint.lastDiffSummary?` is available for callers that want to persist the last summary; the raw `SnapshotNode[]` diff itself stays in-memory only, to keep checkpoints small/portable.
- `DomStateFingerprinter` (the sha256-hash change-detector, cheap and orthogonal to the structural diff) was previously duplicated between `BrowserSession.ts` and `browser-action.ts` — now defined once in `BrowserSession.ts` and re-exported from `browser-action.ts` for back-compat.
- Out of scope for v1.0.9: mapping a diffed node back to a DOM selector for `extract`/`deep_scrape` subtree-targeting — the diff shape needs to prove out on click/wait first.
