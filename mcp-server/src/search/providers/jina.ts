import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

/** Jina AI — s.jina.ai search endpoint. Free, rate-limited (429 on bursts); optional bearer key raises limits. */
export class JinaSearchProvider extends BaseSearchProvider {
  id = 'jina';
  name = 'Jina AI';
  envVar = 'JINA_API_KEY';

  isAvailable(): boolean {
    return true; // works keyless; key (if present) only raises rate limits
  }

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = process.env[this.envVar!];
    if (apiKey && apiKey.trim().length > 10) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers });

    if (!response.ok) {
      const error: any = new Error(`Jina AI HTTP ${response.status}: ${await response.text()}`);
      error.status = response.status;
      throw error;
    }

    const json = await response.json() as {
      data?: Array<{ title: string; url: string; content: string; description?: string }>;
    };
    this.recordSuccess();
    return (json.data || []).slice(0, maxResults).map(r => ({
      provider: 'jina' as const,
      title: r.title,
      url: r.url,
      snippet: r.content || r.description || '',
    }));
  }
}
