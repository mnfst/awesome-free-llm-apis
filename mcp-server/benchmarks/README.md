# MCP Server Agentic Benchmarks

This directory contains the benchmarking suite for measuring the efficiency and performance of the Agentic Middleware and the `code_mode` sandbox.

## Overview

Unlike static JSON parsing benchmarks, this suite measures the real-world efficiency of intelligent subsystems:
1.  **Context Compression**: How effectively the `ContextManager` summarizes history.
2.  **Prompt Intelligence**: Level of precision in architectural reference injection.
3.  **Extraction Performance**: The speed and token savings of sandboxed extraction versus pure LLM generation.

> [!TIP]
> See [**`SAMPLES.md`**](SAMPLES.md) for actual input/output prompts and qualitative "intelligence" traces.

## Evaluation Criteria

| Metric | Calculation | Purpose |
| :--- | :--- | :--- |
| **Token Efficiency** | `Output Tokens / Input Tokens` | Measures the density of information delivered to the model. |
| **Context Savings** | `(1 - Efficiency) * 100` | The percentage of the context window freed for actual task execution. |
| **Execution Latency** | `Time (ms)` | Measures the overhead of the middleware/sandbox pipeline. |

## Benchmark Suites

The suite contains 12 modular benchmark files in `mcp-server/benchmarks/`:

1. **`01-pipeline.bench.ts`**: Evaluates 4-layer memory contribution (ShortTerm, LongTerm, Wiki, VectorStore) and complete untruncated LLM prompt & messages array assembly.
2. **`02-search-router.bench.ts`**: Evaluates search provider normalization, rate limit (429) fallback chains, and SearXNG terminal fallback scoring.
3. **`03-cyber-tool.bench.ts`**: Measures speed and accuracy of security scanning tools, payload normalization, and report generation.
4. **`04-hermes-skills.bench.ts`**: Benchmarks skill index loading, keyword matching, and skill execution runtime.
5. **`05-quantum-tool.bench.ts`**: Measures state vector matrix operations, quantum context entanglements, and circuit optimization overhead.
6. **`06-local-llm-patch-coach.bench.ts`**: Tests 4-phase coach-first protocol (Instruct, Confirm, Patch via live Ollama HTTP, Reinforce) and model candidate ranking.
7. **`07-browser-snapshot-diff.bench.ts`**: Benchmarks DOM snapshot parsing, live HTTP scrape snapshot diffs on `http://localhost:3000`, and Cloudflare structural wipeout detection.
8. **`08-firebase-retry.bench.ts`**: Evaluates auth token refresh retries, exponential backoff timing, and anonymous fallback account provisioning.
9. **`09-vision-tool.bench.ts`**: Benchmarks `vision_tool` pipeline differences between Non-Agentic (single pass) and Agentic (multi-pass subtask decomposition) execution modes.
10. **`10-execute-skill.bench.ts`**: Benchmarks Hermes skill manifest auto-detection, Hermes Adapter Note prompt overhead, and reference file extraction.
11. **`11-wiki-mechanisms.bench.ts`**: Benchmarks `GlobalWikiManager.flushToWiki`, CTF task-graph node serialization & column grouping by `ctfType`, and ADR decision extraction.
12. **`12-pdf-indexing.bench.ts`**: Benchmarks STTP PDF text chunking, VectorStore embedding & RAG query retrieval, and automated Wiki summary note creation.

---

## Running Benchmarks

Ensure you have your environment variables configured (some benchmarks trigger real LLM calls for summarization).

```bash
cd mcp-server
npx vitest bench benchmarks/
```

### Generating Aggregated Sample Logs

To aggregate all benchmark execution logs from `benchmarks/logs/` into `SAMPLES.md`:

```bash
cd mcp-server
npx tsx benchmarks/generate-samples.ts
```

### Rate Limit Guard
Benchmarks include an automated delay between scenarios to respect provider rate limits (RPM/TPM).
