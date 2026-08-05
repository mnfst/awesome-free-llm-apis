import fetch from 'node-fetch';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';

export class BraveSearchProvider extends BaseSearchProvider {
  id = 'brave';
  name = 'Brave Search';
  envVar = 'BRAVE_API_KEY';

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    const apiKey = process.env[this.envVar!] as string;
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const error: any = new Error(`Brave Search HTTP ${response.status}: ${await response.text()}`);
      error.status = response.status;
      throw error;
    }

    const json = await response.json() as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };
    this.recordSuccess();
    return (json.web?.results || []).map(r => ({
      provider: 'brave' as const,
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  }
}
