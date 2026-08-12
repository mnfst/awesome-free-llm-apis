import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

const TINYFISH_MAX_CONTENT_CHARS = 12000;

/** TinyFish Search API + Fetch API (two-phase extraction).
 *  Key required: TINYFISH_API_KEY. Free tier: 30 RPM search / 150 RPM fetch. */
export class TinyFishSearchProvider extends BaseSearchProvider {
  id = 'tinyfish';
  name = 'TinyFish';
  envVar = 'TINYFISH_API_KEY';

  private fetchImpl: typeof fetch = fetch as any;

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const apiKey = process.env[this.envVar!];
    if (!apiKey || !this.isAvailable()) {
      throw new Error('TinyFish API key not configured or invalid');
    }

    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    };

    // Phase 1: Search
    const searchUrl = new URL('https://api.search.tinyfish.ai');
    searchUrl.searchParams.append('query', query);
    searchUrl.searchParams.append('num', String(maxResults));

    const searchResp = await this.fetchImpl(searchUrl.toString(), {
      method: 'GET',
      headers,
    });

    if (!searchResp.ok) {
      const error: any = new Error(`TinyFish HTTP ${searchResp.status}: ${await (searchResp as any).text()}`);
      error.status = searchResp.status;
      throw error;
    }

    const json = await searchResp.json() as {
      results?: Array<{ title: string; url: string; snippet: string; position?: number }>;
    };

    const base: UnifiedSearchResult[] = (json.results || []).slice(0, maxResults).map(r => ({
      provider: 'tinyfish' as const,
      title: r.title,
      url: r.url,
      snippet: r.snippet || '',
    }));

    this.recordSuccess();

    if (base.length === 0) return base;

    // Phase 2: Fetch API extraction (parallel, graceful)
    const extracted = await Promise.allSettled(
      base.map(r => {
        const fetchUrl = new URL('https://api.fetch.tinyfish.ai');
        fetchUrl.searchParams.append('url', r.url);
        return this.fetchImpl(fetchUrl.toString(), { method: 'GET', headers })
          .then(resp => resp.ok ? (resp as any).text() as Promise<string> : Promise.reject(new Error(`Fetch HTTP ${resp.status}`)));
      })
    );

    return base.map((r, i) => {
      const outcome = extracted[i];
      if (outcome.status === 'fulfilled' && outcome.value) {
        return { ...r, fullContent: (outcome.value as string).slice(0, TINYFISH_MAX_CONTENT_CHARS) };
      }
      return r;
    });
  }
}
