# 🛡️ `cyber_tool` — Isolated Security Binary Registry & Wiki Manager

## Overview
`cyber_tool` provides an isolated, process-safe registry and dedicated wiki manager for security binaries (`sqlmap`, `nmap`, `ffuf`, `gobuster`, `nikto`, `hydra`).

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
