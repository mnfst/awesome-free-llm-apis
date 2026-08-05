import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

export class TavilySearchProvider extends BaseSearchProvider {
  id = 'tavily';
  name = 'Tavily';
  envVar = 'TAVILY_API_KEY';

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const apiKey = process.env[this.envVar!];
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: true,
        include_domains: [],
        exclude_domains: [],
      }),
    });

    if (!response.ok) {
      const error: any = new Error(`Tavily HTTP ${response.status}: ${await response.text()}`);
      error.status = response.status;
      throw error;
    }

    const json = await response.json() as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string; score: number }>;
    };
    this.recordSuccess();
    return (json.results || []).map(r => ({
      provider: 'tavily' as const,
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
      answer: json.answer,
    }));
  }
}
