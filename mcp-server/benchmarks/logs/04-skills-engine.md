# Benchmark Log: 04-skills-engine — Hermes Indexing, Adapter & Keyword Search

**Timestamp**: 2026-08-12T09:17:10.667Z

## 🎯 Target Skill Engine & Manifest Context
- **Manifest Skill Count**: 36 bundled Hermes skills
- **Manifest Sample Skills**: `humanizer, codebase-inspection, github-auth, github-code-review, github-issues`
- **Execution Target**: `systematic-debugging`

---

## ⚡ Skills Engine Performance & Keyword Search Breakdown

| Scenario / Metric | Latency | Key Metric | Tokens / Payloads |
|---|---|---|---|
| **1. Manifest Validation** | 11.50 ms | Validated **36 skills** | All manifest entries loadable |
| **2. Keyword Search ("debug")** | 1483.53 ms | Found **10 matching skills** | Matched: `debugger, debugging-and-error-recovery, error-debugging-error-analysis` |
| **3. Prompt Search ("refactor")** | — | Extracted keywords from prompt | Matched: `code-simplifier, fp-async, fp-backend` |
| **4. Empty Keywords Guard** | — | Empty array returned | **0 tokens bloat** (skills count: 0) |
| **5. Adapter Note Injection** | 2.87 ms | Base: 4 tok, Overhead: +101 tok | **Total System Prompt**: 105 tokens |
| **6. End-to-End Execution** | 1743.99 ms | Target: `systematic-debugging` | Response: **18 tokens** (Success: `false`) |

---

## 🔍 Scenario 2: Keyword-Driven Search Inputs & Payload Traces

### Search Query 1: Explicit Keywords `["debug", "error", "traceback"]`
```json
[
  {
    "name": "debugger",
    "description": "Debugging specialist for errors, test failures, and unexpected\nbehavior. Use proactively when encountering any issues.\n"
  },
  {
    "name": "debugging-and-error-recovery",
    "description": "Guides systematic root-cause debugging. Use when tests fail, builds break, behavior doesn't match expectations, or you encounter any unexpected error. Use when you need a systematic approach to finding and fixing the root cause rather than guessing."
  },
  {
    "name": "error-debugging-error-analysis",
    "description": "You are an expert error analysis specialist with deep expertise in debugging distributed systems, analyzing production incidents, and implementing comprehensive observability solutions."
  },
  {
    "name": "error-debugging-error-trace",
    "description": "You are an error tracking and observability expert specializing in implementing comprehensive error monitoring solutions. Set up error tracking systems, configure alerts, implement structured logging, and ensure teams can quickly identify and resolve production issues."
  },
  {
    "name": "error-debugging-multi-agent-review",
    "description": "Use when working with error debugging multi agent review"
  },
  {
    "name": "error-diagnostics-error-analysis",
    "description": "You are an expert error analysis specialist with deep expertise in debugging distributed systems, analyzing production incidents, and implementing comprehensive observability solutions."
  },
  {
    "name": "error-diagnostics-smart-debug",
    "description": "Use when working with error diagnostics smart debug"
  },
  {
    "name": "error-handling-patterns",
    "description": "Build resilient applications with robust error handling strategies that gracefully handle failures and provide excellent debugging experiences."
  },
  {
    "name": "native-data-fetching",
    "description": "Use when implementing or debugging ANY network request, API call, or data fetching. Covers fetch API, React Query, SWR, error handling, caching, offline support, and Expo Router data loaders (`useLoaderData`)."
  },
  {
    "name": "rust-async-patterns",
    "description": "Master Rust async programming with Tokio, async traits, error handling, and concurrent patterns. Use when building async Rust applications, implementing concurrent systems, or debugging async code."
  }
]
```

### Search Query 2: Natural User Prompt `"refactor functional taskeither pipeline"` (Extracted Keywords)
```json
[
  {
    "name": "code-simplifier",
    "description": "Simplifies and refines code for clarity, consistency, and maintainability while preserving all functionality. Use when asked to \"simplify code\", \"clean up code\", \"refactor for clarity\", \"improve readability\", or review recently modified code for elegance. Focuses on project-specific best practices."
  },
  {
    "name": "fp-async",
    "description": "Practical async patterns using TaskEither - clean pipelines instead of try/catch hell, with real API examples"
  },
  {
    "name": "fp-backend",
    "description": "Functional programming patterns for Node.js/Deno backend development using fp-ts, ReaderTaskEither, and functional dependency injection"
  },
  {
    "name": "fp-refactor",
    "description": "Comprehensive guide for refactoring imperative TypeScript code to fp-ts functional patterns"
  },
  {
    "name": "advanced-evaluation",
    "description": "This skill should be used when the user asks to \"implement LLM-as-judge\", \"compare model outputs\", \"create evaluation rubrics\", \"mitigate evaluation bias\", or mentions direct scoring, pairwise comparison, position bias, evaluation pipelines, or automated quality assessment."
  },
  {
    "name": "agentflow",
    "description": "Orchestrate autonomous AI development pipelines through your Kanban board (Asana, GitHub Projects, Linear). Manages multi-worker Claude Code dispatch, deterministic quality gates, adversarial review, per-task cost tracking, and crash-proof pipeline execution."
  },
  {
    "name": "agentic-actions-auditor",
    "description": "Audits GitHub Actions workflows for security vulnerabilities in AI agent integrations  including Claude Code Action,  Gemini CLI, OpenAI Codex, and GitHub AI  Inference.  Detects attack vectors where attacker-controlled  input reaches. AI agents running in CI/CD pipelines.\n"
  },
  {
    "name": "ai-engineering-toolkit",
    "description": "6 production-ready AI engineering workflows: prompt evaluation (8-dimension scoring), context budget planning, RAG pipeline design, agent security audit (65-point checklist), eval harness building, and product sense coaching."
  },
  {
    "name": "ai-ml",
    "description": "AI and machine learning workflow covering LLM application development, RAG implementation, agent architecture, ML pipelines, and AI-powered features."
  },
  {
    "name": "airflow-dag-patterns",
    "description": "Build production Apache Airflow DAGs with best practices for operators, sensors, testing, and deployment. Use when creating data pipelines, orchestrating workflows, or scheduling batch jobs."
  }
]
```

### Search Query 3: Empty Keywords `[]` (Context Bloat Guard Output)
```json
[]
```

---

## 📄 Scenario 3: Extracted Referenced Files (0 files)
```json
[]
```

---

## 📄 Scenario 3: Injected Adapter Note (101 tokens)
```markdown
## MCP Environment Overrides
This skill originates from the Hermes-Agent skill set, authored for a different environment. In THIS environment:
- Do NOT create files or folders directly. Use `manage_memory` for persistent storage instead.
- For fetching external/web data, use `browser_tool`.
- For searching existing code or prior notes, use the workspace context tools (grep/wiki) already available to you — not a raw filesystem search.
Follow the skill's methodology below, but execute it through this server's tools.
```

---
*Generated by Vitest Benchmark Suite (04-skills-engine.bench.ts)*
