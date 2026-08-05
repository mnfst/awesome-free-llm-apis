import type { SearchProvider } from './types.js';
import { ParallelSearchProvider } from './providers/parallel.js';
import { TavilySearchProvider } from './providers/tavily.js';
import { JinaSearchProvider } from './providers/jina.js';
import { BraveSearchProvider } from './providers/brave.js';
import { SearxngSearchProvider } from './providers/searxng.js';

/**
 * Fallback order: Parallel AI -> Tavily -> Jina -> Brave -> SearXNG.
 * Parallel is keyless/highest-throughput so it goes first; SearXNG is the
 * self-hosted terminal fallback (never gated by quota, only by deployment).
 */
export class SearchProviderRegistry {
  private static instance: SearchProviderRegistry;
  private providers: SearchProvider[];

  private constructor() {
    this.providers = [
      new ParallelSearchProvider(),
      new TavilySearchProvider(),
      new JinaSearchProvider(),
      new BraveSearchProvider(),
      new SearxngSearchProvider(),
    ];
  }

  static getInstance(): SearchProviderRegistry {
    if (!SearchProviderRegistry.instance) {
      SearchProviderRegistry.instance = new SearchProviderRegistry();
    }
    return SearchProviderRegistry.instance;
  }

  getProviders(): SearchProvider[] {
    return this.providers;
  }

  getAvailableProviders(): SearchProvider[] {
    return this.providers.filter(p => p.isAvailable());
  }
}
