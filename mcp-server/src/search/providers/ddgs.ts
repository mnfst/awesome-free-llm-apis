import path from 'node:path';
import fs from 'node:fs';
import { BaseSearchProvider } from './base.js';
import type { UnifiedSearchResult } from '../types.js';
import { StdioDevToolsClient, type DevToolsClient } from '../../browser/DevToolsClient.js';

const DDGS_MAX_CONTENT_CHARS = 12000;

function getVenvPython(): string {
  const root = process.cwd();
  const isWin = process.platform === 'win32';
  const venvPy = isWin
    ? path.resolve(root, 'venv', 'Scripts', 'python.exe')
    : path.resolve(root, 'venv', 'bin', 'python');
  return fs.existsSync(venvPy) ? venvPy : (isWin ? 'python' : 'python3');
}

/** Parses raw string output from duckduckgo-mcp-server search tool. */
export function parseDdgSearchResults(text: string): Array<{ title: string; url: string; snippet: string }> {
  if (!text || text.includes('No search results found')) return [];
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  const blocks = text.split(/\n(?=\d+\.\s+)/);
  for (const block of blocks) {
    const titleMatch = block.match(/^\d+\.\s+(.+)$/m);
    const urlMatch = block.match(/^\s*URL:\s*(https?:\/\/\S+)/m);
    const summaryMatch = block.match(/^\s*Summary:\s*(.+)$/m);

    if (titleMatch && urlMatch) {
      results.push({
        title: titleMatch[1].trim(),
        url: urlMatch[1].trim(),
        snippet: summaryMatch ? summaryMatch[1].trim() : '',
      });
    }
  }
  return results;
}

/** DuckDuckGo Search via duckduckgo-mcp-server (Python MCP in venv).
 *  Keyless. Self-enforces 30 RPM search / 20 RPM fetch_content. */
export class DdgsMcpSearchProvider extends BaseSearchProvider {
  id = 'ddgs';
  name = 'DuckDuckGo (MCP)';
  envVar = undefined;

  private clientInstance: DevToolsClient | null = null;

  /** Allows test injection of a mock client. */
  setClient(client: DevToolsClient): void {
    this.clientInstance = client;
  }

  private async getClient(): Promise<DevToolsClient> {
    if (this.clientInstance) return this.clientInstance;
    const pythonCmd = getVenvPython();
    this.clientInstance = await StdioDevToolsClient.connectCustom({
      command: pythonCmd,
      args: ['-m', 'duckduckgo_mcp_server.server'],
      connectTimeoutMs: 30_000,
    });
    return this.clientInstance;
  }

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, maxResults = 5): Promise<UnifiedSearchResult[]> {
    let client: DevToolsClient;
    try {
      client = await this.getClient();
    } catch (err: any) {
      throw new Error(`Failed to start duckduckgo-mcp-server: ${err.message}`);
    }

    // Phase 1: Search tool
    const rawSearch = await client.callTool({
      name: 'search',
      arguments: { query, max_results: maxResults },
    });

    const text = rawSearch?.content?.find((c: any) => c.type === 'text')?.text || (typeof rawSearch === 'string' ? rawSearch : '');
    const parsed = parseDdgSearchResults(text);

    const base: UnifiedSearchResult[] = parsed.map(r => ({
      provider: 'ddgs' as const,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    }));

    this.recordSuccess();

    if (base.length === 0) return base;

    // Phase 2: fetch_content tool per URL
    const extracted = await Promise.allSettled(
      base.map(r =>
        client.callTool({
          name: 'fetch_content',
          arguments: { url: r.url, max_length: DDGS_MAX_CONTENT_CHARS },
        }).then((rawFetch: any) => {
          const content = rawFetch?.content?.find((c: any) => c.type === 'text')?.text || (typeof rawFetch === 'string' ? rawFetch : '');
          if (content && !content.startsWith('Error fetching content')) {
            return content;
          }
          return Promise.reject(new Error('Fetch failed'));
        })
      )
    );

    return base.map((r, i) => {
      const outcome = extracted[i];
      if (outcome.status === 'fulfilled' && outcome.value) {
        return { ...r, fullContent: (outcome.value as string).slice(0, DDGS_MAX_CONTENT_CHARS) };
      }
      return r;
    });
  }
}
