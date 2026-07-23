# 🌐 `browser_tool` — 100% Dynamic Intelligent Browser Scraper

## Overview
`browser_tool` is a universal, domain-agnostic web inspection, exploration, and scraping engine built on top of Chrome DevTools MCP. It features **100% structural node discovery**, **pausable session checkpointing**, **0-token script memory persistence**, and **flat schema CSV/JSON exports**.

---

## 🔑 Key Features

1. **100% Dynamic Structural Node Discovery (`DynamicNodeAnalyzer`)**:
   - Zero hardcoded domain strings or class selectors.
   - Discovers interactive buttons, category sub-tabs, and player/product cards purely by ARIA roles (`role="button"`, `role="tab"`), pointer styles, and DOM hierarchy.

2. **Quantified Page Scroll Depth (`PageDepthObserver` & `ComprehensivePageObserver`)**:
   - Evaluates scroll depth from 0% to 100% bottom fold.
   - Monitors stored state (`localStorage`, `sessionStorage`, cookies).

3. **Pausable & Resumable Session Checkpointing (`ScrapingSessionCheckpointManager`)**:
   - Persists session checkpoints (`SURFACE_EXPLORED`, `AWAITING_USER_SELECTION`, `PAUSED`, `COMPLETED`) to `data/scrapes/checkpoints/`.
   - Allows users to pause, inspect frontend findings, choose target depth options, and resume seamlessly across process restarts.

4. **0-Token Script Memory (`ScriptPersistenceManager`)**:
   - Saves generated JS extraction functions to `data/scrapes/scripts/`.
   - Re-uses script memory on subsequent runs for 0 LLM context token cost.

5. **Universal Tabular Schema Flattening (`UniversalTabularSchemaFlattener`)**:
   - Dynamically flattens arbitrary nested JSON objects and coordinate arrays into clean flat CSV rows (`startX`, `startY`, `endX`, `endY`, `outcome`).

---

## 🛠️ Usage Example

```typescript
// 1. Execute live dynamic scraping session
await client.callTool('browser_tool', {
  url: 'https://www.sofascore.com/football/match/coritiba-palmeiras/nOsHO#id:15237982',
  userInstructions: 'Explore match statistics and player lineups',
  sessionId: 'match_exploration_v1',
  outputDir: 'data/scrapes'
});

// 2. List all active and paused scraping checkpoints on disk
await client.callTool('browser_tool', {
  action: 'list_checkpoints',
  url: 'list_checkpoints'
});
```
