export interface UnifiedSearchResult {
  provider: 'parallel' | 'tinyfish' | 'tavily' | 'ddgs' | 'jina' | 'searxng';
  title: string;
  url: string;
  snippet: string;
  score?: number;
  answer?: string;
  /** Full extracted page content (populated after the extract phase). */
  fullContent?: string;
}

export interface SearchProvider {
  id: string;
  name: string;
  /** Env var holding the API key. Absent for keyless providers (Parallel AI, SearXNG). */
  envVar?: string;
  consecutiveFailures: number;
  isAvailable(): boolean;
  search(query: string, maxResults?: number): Promise<UnifiedSearchResult[]>;
  recordFailure(status: number): void;
  getPenaltyScore(): number;
}
