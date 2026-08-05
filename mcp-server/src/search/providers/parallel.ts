import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

/**
 * Parallel AI — keyless free search for agents/MCP. API key is optional
 * (raises rate limits when present); absence must not gate availability.
 */
export class ParallelSearchProvider extends BaseSearchProvider {
  id = 'parallel';
  name = 'Parallel AI';
  envVar = undefined; // keyless

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'parallel-beta': 'true',
    };
    const apiKey = process.env.PARALLEL_API_KEY;
    if (apiKey && apiKey.trim().length > 10) headers['x-api-key'] = apiKey;

    const response = await fetch('https://api.parallel.ai/v1beta/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        objective: query,
        search_queries: [query],
        mode: 'one-shot',
        max_results: maxResults,
        excerpts: { max_chars_per_result: 10000 },
      }),
    });

    if (!response.ok) {
      const error: any = new Error(`Parallel AI HTTP ${response.status}: ${await response.text()}`);
      error.status = response.status;
      throw error;
    }

    const json = await response.json() as { results?: Array<{ title: string; url: string; summary: string }> };
    this.recordSuccess();
    return (json.results || []).map(r => ({
      provider: 'parallel' as const,
      title: r.title,
      url: r.url,
      snippet: r.summary,
    }));
  }
}
