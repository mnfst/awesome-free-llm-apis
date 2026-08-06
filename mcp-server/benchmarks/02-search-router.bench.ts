import { bench, describe } from "vitest";
import { SearchProviderRegistry } from "../src/search/registry.js";
import { ParallelSearchProvider } from "../src/search/providers/parallel.js";
import { TavilySearchProvider } from "../src/search/providers/tavily.js";
import { JinaSearchProvider } from "../src/search/providers/jina.js";
import { BraveSearchProvider } from "../src/search/providers/brave.js";
import { SearxngSearchProvider } from "../src/search/providers/searxng.js";
import { SearchRouterMiddleware } from "../src/pipeline/middlewares/SearchRouterMiddleware.js";
import { TaskType, type PipelineContext } from "../src/pipeline/middleware.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";

// Ensure benchmark output log is populated
generateLogReport().catch(console.error);

describe("02-search-router benchmarks", () => {
  // Benchmark 1: Provider Normalization (Parallel, Tavily, Jina, Brave, SearXNG)
  bench("Provider Normalization (Parallel, Tavily, Jina, Brave, SearXNG)", async () => {
    const registry = SearchProviderRegistry.getInstance();
    const providers = registry.getProviders();

    for (const provider of providers) {
      const isAvail = provider.isAvailable();
      const penalty = provider.getPenaltyScore();
      // Simulate raw output normalization token count
      const dummyRaw = JSON.stringify({
        provider: provider.id,
        available: isAvail,
        penalty,
        sampleResults: [
          { title: `${provider.name} Result`, url: "https://example.com", snippet: "Sample snippet text for token counting." },
        ],
      });
      countTokens(dummyRaw);
    }
  });

  // Benchmark 2: 429 Fallback Chain Simulation
  bench("429 Fallback Chain Simulation", async () => {
    const parallel = new ParallelSearchProvider();
    const tavily = new TavilySearchProvider();
    const jina = new JinaSearchProvider();
    const brave = new BraveSearchProvider();
    const searxng = new SearxngSearchProvider();

    // Trigger 429 backoff rate limiting on initial tier providers
    parallel.recordFailure(429);
    tavily.recordFailure(429);
    jina.recordFailure(429);

    const candidates = [parallel, tavily, jina, brave, searxng]
      .filter((p) => p.isAvailable())
      .sort((a, b) => a.getPenaltyScore() - b.getPenaltyScore());

    // The top candidate should now be brave or keyless active providers with penalty = 0
    const chosen = candidates[0];
    const dummyOutput = JSON.stringify({ chosen: chosen.id, score: chosen.getPenaltyScore() });
    countTokens(dummyOutput);
  });

  // Benchmark 3: SearXNG Terminal Fallback
  bench("SearXNG Terminal Fallback", async () => {
    const searxng = new SearxngSearchProvider();
    const isAvail = searxng.isAvailable();
    const penalty = searxng.getPenaltyScore();

    const dummyResults = [
      { provider: "searxng" as const, title: "SearXNG Fallback Result", url: "http://localhost:8080/search", snippet: "Self-hosted terminal fallback search result." },
    ];
    const text = JSON.stringify({ isAvail, penalty, results: dummyResults });
    countTokens(text);
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  // Scenario 1 measurement
  const t0 = performance.now();
  const registry = SearchProviderRegistry.getInstance();
  const providers = registry.getProviders();
  let totalNormalizedTokens = 0;
  for (const provider of providers) {
    const isAvail = provider.isAvailable();
    const penalty = provider.getPenaltyScore();
    const dummyRaw = JSON.stringify({
      provider: provider.id,
      available: isAvail,
      penalty,
      sampleResults: [
        { title: `${provider.name} Result`, url: "https://example.com", snippet: "Sample snippet text for token counting." },
      ],
    });
    totalNormalizedTokens += countTokens(dummyRaw);
  }
  const t1 = performance.now();

  // Scenario 2 measurement
  const t2 = performance.now();
  const parallel = new ParallelSearchProvider();
  const tavily = new TavilySearchProvider();
  const jina = new JinaSearchProvider();
  const brave = new BraveSearchProvider();
  const searxng = new SearxngSearchProvider();

  parallel.recordFailure(429);
  tavily.recordFailure(429);
  jina.recordFailure(429);

  const candidates = [parallel, tavily, jina, brave, searxng]
    .filter((p) => p.isAvailable())
    .sort((a, b) => a.getPenaltyScore() - b.getPenaltyScore());

  const chosenProvider = candidates[0]?.id || "none";
  const t3 = performance.now();

  // Scenario 3 measurement
  const t4 = performance.now();
  const searxngFallback = new SearxngSearchProvider();
  const terminalAvail = searxngFallback.isAvailable();
  const terminalPenalty = searxngFallback.getPenaltyScore();
  const t5 = performance.now();

  const logContent = `# Benchmark Log: 02-search-router

**Timestamp**: ${timestamp}

## Scenarios Executed

1. **Provider Normalization (Parallel, Tavily, Jina, Brave, SearXNG)**
   - Latency: ${(t1 - t0).toFixed(2)} ms
   - Providers Evaluated: ${providers.length}
   - Total Sample Normalized Tokens: ${totalNormalizedTokens} tokens

2. **429 Fallback Chain Simulation**
   - Latency: ${(t3 - t2).toFixed(2)} ms
   - Providers Rate-Limited (429): parallel, tavily, jina
   - Next Selected Provider: ${chosenProvider}

3. **SearXNG Terminal Fallback**
   - Latency: ${(t5 - t4).toFixed(2)} ms
   - SearXNG Availability: ${terminalAvail}
   - SearXNG Penalty Score: ${terminalPenalty}

---
*Generated by Vitest Benchmark Suite (02-search-router.bench.ts)*
`;

  await writeBenchmarkLog("02-search-router.md", logContent);
}
