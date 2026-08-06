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

The suite contains 8 modular benchmark files in `mcp-server/benchmarks/`:

1. **`01-pipeline.bench.ts`**: Evaluates prompt injection, sliding window memory compression, and QuickJS sandbox extraction.
2. **`02-search-router.bench.ts`**: Evaluates search provider normalization, rate limit (429) fallback chains, and SearXNG terminal fallback scoring.
3. **`03-cyber-tool.bench.ts`**: Measures speed and accuracy of security scanning tools, payload normalization, and report generation.
4. **`04-hermes-skills.bench.ts`**: Benchmarks skill index loading, keyword matching, and skill execution runtime.
5. **`05-quantum-tool.bench.ts`**: Measures state vector matrix operations, quantum context entanglements, and circuit optimization overhead.
6. **`06-local-llm-patch-coach.bench.ts`**: Tests local LLM diff parsing, patch validation, and automated code coaching loops.
7. **`07-browser-snapshot-diff.bench.ts`**: Benchmarks DOM snapshot parsing, visual diffing, and change detection overhead.
8. **`08-firebase-retry.bench.ts`**: Evaluates auth token refresh retries, exponential backoff timing, and anonymous fallback account provisioning.

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
Benchmarks include an automated **10-30 second delay** between scenarios to respect provider rate limits (RPM/TPM).

