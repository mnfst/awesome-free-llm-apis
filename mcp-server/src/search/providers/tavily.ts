import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

const TAVILY_EXTRACT_CHUNKS = 4;
const TAVILY_MAX_CONTENT_CHARS = 12000;

export class TavilySearchProvider extends BaseSearchProvider {
  id = 'tavily';
  name = 'Tavily';
  envVar = 'TAVILY_API_KEY';

  /** Allows test injection of a mock; production uses real node-fetch. */
  private fetchImpl: typeof fetch = fetch as any;

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const apiKey = process.env[this.envVar!];

    // Phase 1: search
    const searchResp = await this.fetchImpl('https://api.tavily.com/search', {
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

    if (!searchResp.ok) {
      const error: any = new Error(`Tavily HTTP ${searchResp.status}: ${await (searchResp as any).text()}`);
      error.status = searchResp.status;
      throw error;
    }

    const json = await searchResp.json() as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string; score: number }>;
    };

    const base: UnifiedSearchResult[] = (json.results || []).map(r => ({
      provider: 'tavily' as const,
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
      answer: json.answer,
    }));

    this.recordSuccess();

    if (base.length === 0) return base;

    // Phase 2: extract — query-reranked full page content
    try {
      const extractResp = await this.fetchImpl('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          urls: base.map(r => r.url),
          query,
          chunks_per_source: TAVILY_EXTRACT_CHUNKS,
          extract_depth: 'basic',
        }),
      });

      if (extractResp.ok) {
        const extracted = await extractResp.json() as {
          results?: Array<{ url: string; raw_content: string }>;
        };
        const contentMap = new Map((extracted.results || []).map(r => [r.url, r.raw_content]));
        return base.map(r => {
          const content = contentMap.get(r.url);
          return content
            ? { ...r, fullContent: content.slice(0, TAVILY_MAX_CONTENT_CHARS) }
            : r;
        });
      }
    } catch {
      // extraction is best-effort; return base results
    }

    return base;
  }
}

