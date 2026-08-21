import { describe, it, expect, vi } from 'vitest';
import { useFreeLLM } from '../src/tools/use-free-llm.js';
import { SearchProviderRegistry } from '../src/search/registry.js';
import type { SearchProvider, UnifiedSearchResult } from '../src/search/types.js';

describe('SearchRouterMiddleware & use_free_llm Integration', () => {
  it('intercepts search requests and bypasses native google_search rate limits on gemini-3.1-flash-lite', async () => {
    const registry = SearchProviderRegistry.getInstance();
    
    // Register mock search provider
    const mockSearchProvider: SearchProvider = {
      id: 'mock-search',
      name: 'Mock Search Provider',
      isAvailable: () => true,
      getPenaltyScore: () => 0,
      recordSuccess: () => {},
      recordFailure: () => {},
      search: async (query: string): Promise<UnifiedSearchResult[]> => [
        {
          provider: 'mock-search',
          title: `Search Result for ${query}`,
          url: 'https://search.example.com',
          snippet: 'Unified search result snippet bypassing Gemini 2.5 20 RPD limit.',
          score: 1.0,
        },
      ],
    };

    // Inject mock search provider into registry
    (registry as any).providers = [mockSearchProvider];

    const response = await useFreeLLM({
      model: 'gemini-3.1-flash-lite',
      taskType: 'search' as any,
      messages: [
        { role: 'user', content: 'latest deepseek-r1 benchmarks security rate-limit' },
      ],
    });

    expect(response).toBeDefined();
    expect(response.choices[0].message.content).toContain('Search Result for latest deepseek-r1 benchmarks security rate-limit');
    expect(response.choices[0].message.content).toContain('Unified search result snippet bypassing Gemini 2.5 20 RPD limit');
  });
});
