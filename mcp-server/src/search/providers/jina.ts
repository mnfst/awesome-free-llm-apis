import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

const JINA_MAX_CONTENT_CHARS = 12000;

/** Jina AI — two-phase: s.jina.ai search + r.jina.ai Reader extraction.
 *  Keyless for both endpoints; optional bearer key raises rate limits. */
export class JinaSearchProvider extends BaseSearchProvider {
  id = 'jina';
  name = 'Jina AI';
  envVar = 'JINA_API_KEY';

  /** Allows test injection of a mock; production uses real node-fetch. */
  private fetchImpl: typeof fetch = fetch as any;

  isAvailable(): boolean {
    return true; // works keyless; key (if present) only raises rate limits
  }

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const apiKey = process.env[this.envVar!];
    const authHeader: Record<string, string> = apiKey && apiKey.trim().length > 10
      ? { 'Authorization': `Bearer ${apiKey}` }
      : {};

    // Phase 1: search
    const searchResp = await this.fetchImpl(
      `https://s.jina.ai/${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json', ...authHeader } }
    );

    if (!searchResp.ok) {
      const error: any = new Error(`Jina AI search HTTP ${searchResp.status}`);
      error.status = searchResp.status;
      throw error;
    }

    const json = await searchResp.json() as {
      data?: Array<{ title: string; url: string; content: string; description?: string }>;
    };

    const base: UnifiedSearchResult[] = (json.data || [])
      .slice(0, maxResults)
      .map(r => ({
        provider: 'jina' as const,
        title: r.title,
        url: r.url,
        snippet: r.content || r.description || '',
      }));

    this.recordSuccess();

    if (base.length === 0) return base;

    // Phase 2: Reader extraction (parallel, fail-graceful per URL)
    const readerHeaders: Record<string, string> = {
      'X-Md-Link-Style': 'discarded',
      'X-Retain-Images': 'none',
      'Accept': 'text/plain',
      ...authHeader,
    };

    const extracted = await Promise.allSettled(
      base.map(r =>
        this.fetchImpl(`https://r.jina.ai/${r.url}`, { headers: readerHeaders })
          .then(resp =>
            resp.ok
              ? (resp as any).text() as Promise<string>
              : Promise.reject(new Error(`Reader HTTP ${resp.status}`))
          )
      )
    );

    return base.map((r, i) => {
      const outcome = extracted[i];
      if (outcome.status === 'fulfilled' && outcome.value) {
        return { ...r, fullContent: (outcome.value as string).slice(0, JINA_MAX_CONTENT_CHARS) };
      }
      return r;
    });
  }
}

