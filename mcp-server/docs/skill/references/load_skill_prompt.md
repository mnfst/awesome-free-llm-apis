# `load_skill_prompt`

**Purpose:** Search, list, or fetch dynamic skill prompts from local skill manifests, the remote agentic-awesome index, or bundled Hermes skills.

**Required params:** `type` (`'search' | 'load' | 'list'`)
**Key optional params:** `name` (required for `'load'`), `keywords`, `source` (`'agentic-awesome' | 'hermes'`), `workspaceDir`

---

### Invocation Examples

#### 1. Search Skills by Keywords
```json
{
  "type": "search",
  "keywords": ["debug", "auth", "jwt"]
}
```

#### 2. Search Skills by Prompt Text (Auto-Keyword Extraction)
If `keywords` is omitted or empty, `load_skill_prompt` automatically derives keywords from the prompt string passed in `name` (`name.split(/\s+/)`):
```json
{
  "type": "search",
  "name": "refactor functional taskeither auth pipeline"
}
```

#### 3. Load Specific Skill System Prompt
```json
{
  "type": "load",
  "name": "ab-test-setup",
  "source": "hermes"
}
```

---

### 🛡️ Context Bloat Guard & Hermes Fallback

- **Empty Keywords Guard**: Passing explicit `keywords: []` returns `{ success: true, skills: [] }` with **0 tokens bloat**, preventing uncalibrated prompt expansion.
- **Bundled Hermes Fallback**: When searching local workspace or online skill indices returns no matches, `load_skill_prompt` automatically falls back to `searchHermesSkills(keywords)` across all 36 bundled Hermes skills (`external/hermes/`).
- **Adapter Note**: Loaded Hermes skills inject a 101-token environment override note instructing the model to use the server's native tools (`manage_memory`, `browser_tool`) instead of raw filesystem operations.
