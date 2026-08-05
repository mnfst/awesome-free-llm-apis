import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

/**
 * SearXNG — self-hosted, terminal fallback. Unlimited but requires an instance
 * to be deployed and SEARXNG_BASE_URL to be set; otherwise treated unavailable
 * rather than throwing (see isAvailable()).
 */
export class SearxngSearchProvider extends BaseSearchProvider {
  id = 'searxng';
  name = 'SearXNG';
  envVar = undefined;

  isAvailable(): boolean {
    const base = process.env.SEARXNG_BASE_URL;
    return !!base && base.trim().length > 0;
  }

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const base = (process.env.SEARXNG_BASE_URL || '').replace(/\/$/, '');
    const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      const error: any = new Error(`SearXNG HTTP ${response.status}: ${await response.text()}`);
      error.status = response.status;
      throw error;
    }

    const json = await response.json() as {
      results?: Array<{ title: string; url: string; content: string; engine: string }>;
    };
    this.recordSuccess();
    return (json.results || []).slice(0, maxResults).map(r => ({
      provider: 'searxng' as const,
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
  }
}
