# 🛡️ `cyber_tool` — Educational Security Coach, Registry & Wiki Manager

## Overview
`cyber_tool` provides an isolated, process-safe registry and dedicated wiki manager for security binaries (`sqlmap`, `nmap`, `ffuf`, `gobuster`, `nikto`, `hydra`), **plus** an educational coach that teaches the learner how to use them.

## ⚠️ No-execution / authorized-use policy
`cyber_tool` never runs any command or binary. Every `learn`/`coach` response is guidance for the **human to run themselves** — commands, flag explanations, expected output, and safety/authorization notes. The underlying system prompt instructs the model to refuse help for targets that aren't clearly an authorized test, CTF, or lab exercise, and to never claim it executed something or observed real output.

---

## 🔑 Key Features

1. **UserProfile Directory Tool Registry (`CyberToolsRegistry`)**:
   - Stores tool mappings in userhome directory: `~/.free-llm-mcp/cyber-tools-registry.json`.
   - Process-safe atomic file locking (`.lock`) ensures safe concurrent reads and writes across multi-agent processes.

2. **Isolated Cyber Wiki Namespace (`global-cyber-tools`)**:
   - Security tool command flags, WAF/IPS bypass remediations (`--tamper`), troubleshooting logs, and reliability stats are stored in the isolated `global-cyber-tools` wiki namespace.
   - Completely isolated from general workspace code RAG context to prevent cross-contamination.

3. **Tool Execution Reliability Tracking (`GlobalWikiManager`)**:
   - Tracks success/failure execution metrics and flushes reliability trends to durable wiki pages.

---

## 🛠️ Usage Example

```typescript
// 1. List registered security tools
await client.callTool('cyber_tool', { action: 'list_tools' });

// 2. Fetch tool GitHub repository URL
await client.callTool('cyber_tool', { action: 'get_tool', toolName: 'sqlmap' });

// 3. Register a new custom security tool
await client.callTool('cyber_tool', {
  action: 'register_tool',
  toolName: 'subfinder',
  githubUrl: 'https://github.com/projectdiscovery/subfinder'
});

// 4. Lookup tool flags and troubleshooting wiki page
await client.callTool('cyber_tool', { action: 'wiki_lookup', toolName: 'ffuf' });
```

---

## 🎓 Educational Coach

These actions never execute anything — they generate step-by-step guidance (via the security-tuned
`TaskType.Cyber` model/persona routing already used by `use_free_llm`) for the learner to run
themselves, and persist progress so a session or CTF challenge can be resumed later.

### `learn` — generate a guided walkthrough for a goal
```typescript
await client.callTool('cyber_tool', {
  action: 'learn',
  goal: 'enumerate services on a lab host with nmap',
  level: 'beginner',       // 'beginner' | 'intermediate' | 'advanced', default 'beginner'
  sessionId: 'ctf-challenge-1'
});
// -> { success, walkthrough, progressKey, graphKey }
```
Each step in the walkthrough includes the exact command, an explanation of each flag, the expected
output, how to interpret it, and a safety/authorization note. This also seeds a CTF decision graph
(see below) with a root "goal" node.

### `coach` — advise the next step from a report-back
```typescript
await client.callTool('cyber_tool', {
  action: 'coach',
  sessionId: 'ctf-challenge-1',
  toolName: 'nmap',                       // optional — pulls in that tool's memory (see below)
  observation: 'nmap showed port 80 open'
});
// -> { success, nextStep, notes, progressKey, graphKey }
```
`coach` explicitly loads and injects the saved progress record, the CTF decision graph, and (if
`toolName` is given) that tool's run-suggestion memory into the LLM call, so the learner can resume a
challenge with its full reasoning trail intact — not just whatever the generic RAG pass happens to
surface. It then extends the decision graph with a new node for this step (marked `deadend` if the
observation reads like a failure) and appends the resulting suggestion to that tool's memory.

### `save_graph` / `load_graph` — CTF decision graph
While solving a CTF, each hypothesis/action/finding can be recorded as a node in a decision graph tied
to the `sessionId` (the challenge id). The graph is persisted as a wiki page (`ctf-graph/{sessionId}`)
whose body is a serialized node/edge graph and whose `links` field mirrors the edges — the same
durable-graph convention used elsewhere in this codebase.
```typescript
// Record a step
await client.callTool('cyber_tool', {
  action: 'save_graph',
  sessionId: 'ctf-challenge-1',
  graphNode: { id: 'hyp-1', label: 'try SQLi on login form', type: 'hypothesis', from: 'root' }
});

// Reload it later (e.g. to resume the challenge, or inspect the trail)
await client.callTool('cyber_tool', { action: 'load_graph', sessionId: 'ctf-challenge-1' });
// -> { success, nodes, edges, rendered }
```

### `tool_memory` — per-CLI-tool run-suggestion library
Maintains a "library" of run suggestions per security tool (nmap, sqlmap, ffuf, …), separate from the
static `flags_and_troubleshooting` wiki page, so context about what was tried and how it went is
preserved and reused across sessions.
```typescript
await client.callTool('cyber_tool', {
  action: 'tool_memory',
  memoryOp: 'write',
  toolName: 'nmap',
  note: '-sV -p- for a full service scan on lab targets'
});

await client.callTool('cyber_tool', {
  action: 'tool_memory',
  memoryOp: 'read',
  toolName: 'nmap'
});
// -> { success, runSuggestions, flagsAndTroubleshooting, reliability }
```
