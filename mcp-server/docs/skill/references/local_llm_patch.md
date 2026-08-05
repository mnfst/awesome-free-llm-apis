# `local_llm_patch` (added v1.0.9, not yet wired into MCP/server)

**Purpose:** Single-file patch stub driven entirely by a local Ollama server (`http://localhost:11434`, no auth) — deliberately scoped down from the full `coding_agents` vision, per the v1.0.9 retrospective on whether local models + `repo_graph.json` RAG would pay off yet (they don't, at this granularity — see non-goals below).

**Input:** `{ filePath, instruction, workspace_root?, sessionId? }`
**Output:** `{ success, filePath?, modelUsed?, usedFallbackModel?, patch?, error? }`

### Flow (`src/tools/local-llm-patch.ts`)
1. List local models via `listLocalModels()` (`src/providers/ollama-local.ts`, `GET /api/tags`) — fails fast with an actionable error if no local server is reachable or no models are pulled (no silent fallback to a cloud provider; that would defeat the cost/privacy reason someone picked this tool).
2. Rank candidates with `rankCandidateModels()` — coding-oriented names (`codellama`, `qwen*-coder`, `devstral`, `deepseek-coder`, `*coder*`) are preferred, but this is *ordering only, not filtering*. There is no reliable `/api/tags` field marking a model as embedding-only (name conventions like `nomic-embed-text` aren't guaranteed) — the tool never assumes a model can chat from its name.
3. Gather light context via `ContextGatherer.gatherContext()` (grep + 1-hop graph neighborhood), scoped to the target file.
4. Try each ranked candidate's `POST /api/chat` in order; a real call failure (not a name guess) is what proves a candidate can't chat, and the loop falls through to the next one. `usedFallbackModel: true` if the first pick wasn't used.
5. Returns the model's full-file replacement as a proposed patch (fenced-code-block stripped) — **never writes to disk**. Applying it is left to the human/agent.

### Non-goals (explicit, not just deferred silently)
- No multi-file patches — single `filePath` only.
- No dataflow/variable-flow analysis — nothing in this repo does real def-use tracking yet (no LSP/AST); a regex shortcut would produce false confidence, worse than admitting the gap.
- No `repo_graph.json` semantic RAG — `ContextGatherer`'s existing grep+graph lookup is reused as-is; wiring the unused `VectorStore` to graph nodes is real, separately-scoped work that doesn't pay off at single-file granularity (deferred to v1.1.0).
- No auto-apply, no diff-preview UI, no LSP validation.
- Not registered into `ProviderRegistry`/`TextRouterMiddleware` — it's localhost-only/optional and the general fallback loop shouldn't try-and-fail against a host that may not be running. Not yet wired into `src/mcp/index.ts` or `src/server.ts` either — it exists as standalone, tested, importable modules pending that follow-up.
