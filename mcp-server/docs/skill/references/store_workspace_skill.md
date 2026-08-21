# `store_workspace_skill`

**Purpose:** Create or register a custom helper skill, debugging utility, or reference script under the workspace customizations root.

**Required params:** `name`, `description`, `what`
**Key optional params:** `workspace_root`, `why`, `files`

### Invocation
```json
{
  "name": "db-migration-helper",
  "description": "Database migration verification utility and rollback script wrapper.",
  "what": [
    "Added verify-migrations.sh script to validate DB schemas post-migration.",
    "Integrated schema diff checks before executing prisma migrate deploy."
  ],
  "why": "Prevent schema drift during rapid deployment cycles.",
  "files": ["scripts/verify-migrations.sh"],
  "workspace_root": "/abs/path/to/project"
}
```
