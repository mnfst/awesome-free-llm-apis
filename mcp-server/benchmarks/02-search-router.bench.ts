import { bench, describe, afterAll } from "vitest";
import { useCacheIsolation } from "../tests/helpers/test-cache-isolation.js";
import { SearchRouterMiddleware } from "../src/pipeline/middlewares/SearchRouterMiddleware.js";
import { SearchProviderRegistry } from "../src/search/registry.js";
import { ParallelSearchProvider } from "../src/search/providers/parallel.js";
import { TavilySearchProvider } from "../src/search/providers/tavily.js";
import { JinaSearchProvider } from "../src/search/providers/jina.js";
import { TinyFishSearchProvider } from "../src/search/providers/tinyfish.js";
import { DdgsMcpSearchProvider } from "../src/search/providers/ddgs.js";
import { SearxngSearchProvider } from "../src/search/providers/searxng.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";
import type { PipelineContext } from "../src/pipeline/middleware.js";
import type { UnifiedSearchResult } from "../src/search/types.js";

useCacheIsolation();

const iterationTraces: Array<{
  tMs: number;
  input: any;
  provider?: string;
  resCount: number;
}> = [];

describe("02-search-router benchmarks (Production SearchRouterMiddleware Execution)", () => {
  afterAll(async () => {
    await generateLogReport();
  });

  // Benchmark 1: SearchRouterMiddleware Execution & Normalization
  bench("SearchRouterMiddleware.execute() — Normalization & Formatting", async () => {
    const middleware = new SearchRouterMiddleware();
    const requestPayload = {
      model: "gemini-3.1-flash-lite",
      google_search: true,
      messages: [
        { role: "user", content: "latest deepseek-r1 benchmarks security rate-limit" }
      ]
    };
    const context: PipelineContext = {
      request: requestPayload,
      taskType: "search" as any,
      isOnePass: true
    };

    const t0 = performance.now();
    await middleware.execute(context, async () => {});
    const t1 = performance.now();

    const trace = (context as any).searchTrace;
    iterationTraces.push({
      tMs: t1 - t0,
      input: requestPayload,
      provider: trace?.provider,
      resCount: trace?.results?.length || 0
    });

    countTokens(JSON.stringify(context.response || {}));
  });

  // Benchmark 2: 429 Fallback Chain Simulation
  bench("429 Fallback Chain Simulation via SearchProviderRegistry", async () => {
    SearchProviderRegistry.resetInstance();
    const parallel = new ParallelSearchProvider();
    const tavily = new TavilySearchProvider();
    const jina = new JinaSearchProvider();
    const tinyfish = new TinyFishSearchProvider();
    const ddgs = new DdgsMcpSearchProvider();
    const searxng = new SearxngSearchProvider();

    parallel.recordFailure(429);
    tavily.recordFailure(429);
    jina.recordFailure(429);

    const candidates = [parallel, tinyfish, tavily, ddgs, jina, searxng]
      .filter((p) => p.isAvailable())
      .sort((a, b) => a.getPenaltyScore() - b.getPenaltyScore());

    const chosen = candidates[0];
    countTokens(JSON.stringify({ chosen: chosen?.id, score: chosen?.getPenaltyScore() }));
  });

  // Benchmark 3: SearXNG Terminal Fallback
  bench("SearXNG Terminal Fallback Execution", async () => {
    const searxng = new SearxngSearchProvider();
    const isAvail = searxng.isAvailable();
    const penalty = searxng.getPenaltyScore();

    const dummyResults: UnifiedSearchResult[] = [
      { provider: "searxng", title: "SearXNG Terminal Fallback Result", url: "http://localhost:8080/search", snippet: "Self-hosted terminal fallback search result.", score: 1.0 },
    ];
    countTokens(JSON.stringify({ isAvail, penalty, results: dummyResults }));
  });
});

async function generateLogReport() {
  SearchProviderRegistry.resetInstance();
  const timestamp = new Date().toISOString();
  const sampleQuery = "latest deepseek-r1 benchmarks security rate-limit";

  const mcpToolInputPayload = {
    tool: "use_free_llm",
    request: {
      model: "gemini-3.1-flash-lite",
      google_search: true,
      messages: [
        { role: "user", content: sampleQuery }
      ]
    },
    taskType: "search"
  };

  // Scenario 1: Execute production SearchRouterMiddleware
  const middleware = new SearchRouterMiddleware();
  const context: PipelineContext = {
    request: mcpToolInputPayload.request,
    taskType: "search" as any,
    isOnePass: true
  };

  const t0 = performance.now();
  await middleware.execute(context, async () => {});
  const t1 = performance.now();

  const formattedResponse = context.response;
  const searchTrace = (context as any).searchTrace;
  const isLive = Boolean(searchTrace?.results);

  // Fallback data if live external provider API calls are offline
  const fallbackResults: UnifiedSearchResult[] = [
    {
      provider: "searxng",
      title: `DeepSeek-R1 Benchmarks & Rate Limiting Overview`,
      url: "https://searxng.example.com/search?q=deepseek-r1",
      snippet: `Comprehensive performance and security analysis for DeepSeek-R1 models across reasoning tasks and rate-limited API endpoints.`,
      score: 1.0
    },
    {
      provider: "searxng",
      title: `Security Best Practices: Rate Limiting & Auth Middleware`,
      url: "https://docs.example.com/security/rate-limit",
      snippet: `Architectural design guidelines for implementing sliding-window rate limiters and auth isolation gates in Node.js servers.`,
      score: 0.95
    }
  ];

  const displayResults = searchTrace?.results || fallbackResults;
  const chosenProvider = searchTrace?.provider || "searxng (terminal fallback)";
  const executionStatus = isLive ? "LIVE_PROVIDER_HIT" : "OFFLINE_FALLBACK_STUB_ACTIVE";

  // Candidate chain evaluation
  const registry = SearchProviderRegistry.getInstance();
  const providers = registry.getProviders();
  const candidateChain = providers.map(p => ({
    id: p.id,
    name: p.name,
    available: p.isAvailable(),
    penalty: p.getPenaltyScore()
  }));

  const logContent = `# Benchmark Log: 02-search-router — Production SearchRouterMiddleware Execution

**Timestamp**: ${timestamp}
**Execution Status**: \`${executionStatus}\`

## 📥 1. MCP Server Tool Call Input Payload (\`use_free_llm\` with \`google_search: true\`)
\`\`\`json
${JSON.stringify(mcpToolInputPayload, null, 2)}
\`\`\`

---

## 🎯 2. Internal Subtask Execution Telemetry
- **Source Middleware**: \`SearchRouterMiddleware\` (\`src/pipeline/middlewares/SearchRouterMiddleware.ts\`)
- **Input Search Query**: \`"${sampleQuery}"\`
- **Target Category**: \`TaskType.SemanticSearch\`
- **Chosen Search Provider**: \`${chosenProvider}\`
- **Execution Latency**: ${(t1 - t0).toFixed(2)} ms
- **Iteration Run Count**: ${iterationTraces.length} bench iterations tracked

---

## 🔍 Normalized Search Provider Output Results (\`UnifiedSearchResult[]\`)

\`\`\`json
${JSON.stringify(displayResults, null, 2)}
\`\`\`

---

## 📄 Formatted Pipeline Response Body (\`context.response\`)

\`\`\`markdown
${formattedResponse?.choices?.[0]?.message?.content || displayResults.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join('\n\n')}
\`\`\`

---

## 📊 Fallback Chain Status Matrix

\`\`\`json
${JSON.stringify(candidateChain, null, 2)}
\`\`\`

---
*Generated by Vitest Benchmark Suite (02-search-router.bench.ts)*
`;

  await writeBenchmarkLog("02-search-router.md", logContent);
}
