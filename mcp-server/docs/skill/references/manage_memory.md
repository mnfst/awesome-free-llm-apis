# `manage_memory`

**Purpose:** Manage persistent workspace-aware memory for context across sessions.

**Required params:** `action`
**Key optional params:** `workspace_root`, `query`, `limit`

### Invocation (search)
```json
{
  "action": "search",
  "workspace_root": "/abs/path/to/project",
  "query": "authentication"
}
```

See [Memory Usage Guide](memory-usage.md) for the underlying wiki structure, PDF offset caching, and vector store details.
