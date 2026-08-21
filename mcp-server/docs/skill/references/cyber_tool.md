# `cyber_tool`

**Purpose:** Isolated, process-safe security-tool registry (`~/.free-llm-mcp/cyber-tools-registry.json`) plus a CTF decision-graph recorder for multi-step engagements.

**Required params:** `action`

### Common actions
- `list_tools` / `get_tool` / `register_tool` — file-locked userprofile registry of security binaries and command flags.
- `wiki_lookup` — WAF/IPS troubleshooting notes under the `global-cyber-tools` wiki namespace.
- `save_graph` / `load_graph` — persist/retrieve a session's CTF decision graph: nodes typed `goal | hypothesis | action | finding | deadend`, edges linking them.

### Dashboard visualization (added v1.0.9)
`GET /api/cyber_tool/task_graph/:sessionId` (`src/server.ts`) calls `cyberTool({ action: 'load_graph', sessionId })` and returns the same node/edge shape the tool already persisted — no new graph format was introduced. The dashboard's Wiki tab renders it via `renderCyberGraph()`/`loadCyberGraph()` (`dashboard/app.js`), grouping nodes into columns by `ctfType` and listing edges beneath.

Every action is logged via `ChatLogger.logToolCall` (`src/tools/cyber-tool.ts`), which is what the graph endpoint reads back from.
