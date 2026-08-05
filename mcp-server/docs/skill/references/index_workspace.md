# `index_workspace`

**Purpose:** Proactively index all relevant files in the workspace for semantic search.

**Required params:** `workspace_root`
**Key optional params:** `force`

### Invocation
```json
{
  "workspace_root": "/abs/path/to/project",
  "force": false
}
```

### Response
```json
{
  "totalFiles": 142,
  "indexedFiles": 142,
  "skippedFiles": 0,
  "errors": []
}
```
