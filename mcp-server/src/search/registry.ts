import type { SearchProvider } from './types.js';
import { ParallelSearchProvider } from './providers/parallel.js';
import { TinyFishSearchProvider } from './providers/tinyfish.js';
import { TavilySearchProvider } from './providers/tavily.js';
import { DdgsMcpSearchProvider } from './providers/ddgs.js';
import { JinaSearchProvider } from './providers/jina.js';
import { SearxngSearchProvider } from './providers/searxng.js';

/**
 * Fallback order: Parallel AI -> TinyFish -> Tavily -> DDGS (MCP) -> Jina -> SearXNG.
 * Parallel is keyless/highest-throughput so it goes first; SearXNG is the
 * self-hosted terminal fallback.
 */
export class SearchProviderRegistry {
  private static instance: SearchProviderRegistry;
  private providers: SearchProvider[];

  private constructor() {
    this.providers = [
      new ParallelSearchProvider(),
      new TinyFishSearchProvider(),
      new TavilySearchProvider(),
      new DdgsMcpSearchProvider(),
      new JinaSearchProvider(),
      new SearxngSearchProvider(),
    ];
  }

  static getInstance(): SearchProviderRegistry {
    if (!SearchProviderRegistry.instance) {
      SearchProviderRegistry.instance = new SearchProviderRegistry();
    }
    return SearchProviderRegistry.instance;
  }

  static resetInstance(): void {
    (SearchProviderRegistry as any).instance = undefined;
  }

  getProviders(): SearchProvider[] {
    return this.providers;
  }

  getAvailableProviders(): SearchProvider[] {
    return this.providers.filter(p => p.isAvailable());
  }
}
