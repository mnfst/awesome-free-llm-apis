# `execute_skill`

**Purpose:** Run a prompt grounded in a local skill's instructions and reference files.

**Required params:** `skill`, `input`
**Key optional params:** `model`, `workspace_root`, `source`

### Invocation
```json
{
  "skill": "ab-test-setup",
  "input": "Design an A/B test for the checkout button.",
  "workspace_root": "/abs/path/to/project"
}
```

### Response
- Resolves the `ab-test-setup` directory under `.free-llm-mcp/skills/` or the global config.
- Injects `SKILL.md` and all referenced markdown files (e.g., `references/metrics.md`) into the system prompt before calling the LLM.

### Hermes Skills (`source: 'hermes'`, added v1.0.9)

`source` defaults to auto-detect: if `skill` isn't found as an `agentic-awesome` workspace/global skill, `execute_skill` tries `findHermesSkill()`/`loadHermesSkillContent()` (`src/hermes/loader.ts`) against the bundled `external/hermes/` skill set (fetched once via `scripts/fetch-hermes-skills.ts` from `github.com/nousresearch/hermes-agent`, committed to the repo — never fetched at request time). A `HERMES_ADAPTER_NOTE` is injected ahead of the skill content instructing the model to use this server's own tools (`manage_memory`, `browser_tool`) instead of raw filesystem operations the original Hermes skill may assume. Pass `source: 'agentic-awesome'` explicitly to skip the Hermes lookup, or `source: 'hermes'` to require it (surfacing a real error instead of silently falling through if not found).

Use `load_skill_prompt` with `type: 'list', source: 'hermes'` to enumerate available Hermes skills before calling `execute_skill`.
