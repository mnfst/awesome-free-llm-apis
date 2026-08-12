import type { Middleware, NextFunction, PipelineContext } from '../middleware.js';
import { TaskType } from '../middleware.js';
import { SearchProviderRegistry } from '../../search/registry.js';
import type { UnifiedSearchResult } from '../../search/types.js';
import { logToolCall } from '../../utils/ChatLogger.js';

/**
 * Routes search requests (context.request.google_search or TaskType.SemanticSearch)
 * through a free-provider fallback chain (Parallel AI -> Tavily -> Jina -> Brave ->
 * SearXNG) instead of forcing a Gemini google_search call. Mirrors
 * TextRouterMiddleware's sequential try/catch fallback loop and BaseProvider's
 * circuit-breaker cooldown scoring (src/providers/base.ts), but over
 * SearchProvider instead of Provider.
 *
 * On success, short-circuits the pipeline by setting context.response (same
 * pattern AgenticMiddleware uses — see TextRouterMiddleware.execute()'s
 * `if (context.response) return await next();` guard). If every provider is
 * unavailable/fails, does NOT set context.response, so the request falls
 * through to TextRouterMiddleware's existing Gemini google_search path as a
 * last-resort fallback.
 */
export class SearchRouterMiddleware implements Middleware {
  name = 'SearchRouterMiddleware';

  private extractQuery(context: PipelineContext): string {
    const messages = context.request.messages || [];
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const content = lastUser?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const textPart = content.find((c: any) => c?.type === 'text');
      return textPart?.text || '';
    }
    return '';
  }

  private formatResponse(query: string, results: UnifiedSearchResult[], providerId: string): PipelineContext['response'] {
    const answer = results.find(r => r.answer)?.answer;
    const lines = results.map((r, i) => {
      const header = `${i + 1}. **[${r.title}](${r.url})**\n   - **Provider**: \`${r.provider || providerId}\` | **Relevance**: ${r.score ?? 1.0}\n   - **Snippet**: ${r.snippet}`;
      const extract = r.fullContent
        ? `\n\n   <details><summary>📄 Extracted Content</summary>\n\n${r.fullContent}\n\n   </details>`
        : '';
      return header + extract;
    });
    const body = [
      `### 🔍 Web Search Grounding: "${query}" (via ${providerId.toUpperCase()})`,
      answer ? `> **Direct Answer Summary**: ${answer}` : null,
      lines.length > 0 ? lines.join('\n\n') : '_No search results found._',
    ].filter(Boolean).join('\n\n');

    return {
      id: `search-${providerId}-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: `search:${providerId}`,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: body },
        finish_reason: 'stop',
      }],
    };
  }

  /**
   * Logs a completed search to the local per-session chat-logs.json (same
   * mechanism browser_tool/cyber_tool use, so it renders in the existing
   * dashboard chat-log view for free) and fire-and-forget to Firestore's
   * `search_logs` collection for cross-session/dashboard aggregation.
   * Never awaited on the response path — logging must not add latency or
   * ever affect the actual search result.
   */
  private logSearch(context: PipelineContext, query: string, provider: string, results: UnifiedSearchResult[], latencyMs: number): void {
    const sessionId = context.sessionId || context.request.sessionId || 'search-adhoc';
    const fullResults = results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet }));

    logToolCall(sessionId, 'search_tool:search', { query, provider }, {
      provider,
      resultCount: results.length,
      results: fullResults,
    }, latencyMs, false).catch(() => {});

    import('../../utils/firebase.js').then(({ logSearchQuery }) =>
      logSearchQuery('anonymous', {
        query,
        provider,
        sessionId,
        resultCount: results.length,
        results: fullResults,
      })
    ).catch(() => {});
  }

  async execute(context: PipelineContext, next: NextFunction): Promise<void> {
    if (context.response) {
      return await next();
    }

    const wantsSearch = context.request.google_search || context.taskType === TaskType.SemanticSearch;
    if (!wantsSearch) {
      return await next();
    }

    const query = this.extractQuery(context);
    if (!query) {
      return await next();
    }

    const registry = SearchProviderRegistry.getInstance();
    const candidates = registry.getAvailableProviders()
      .slice()
      .sort((a, b) => a.getPenaltyScore() - b.getPenaltyScore());

    for (const provider of candidates) {
      const start = Date.now();
      try {
        const results = await provider.search(query);
        if (results.length > 0) {
          context.response = this.formatResponse(query, results, provider.id);
          (context as any).searchTrace = { query, provider: provider.id, results, latencyMs: Date.now() - start };
          this.logSearch(context, query, provider.id, results, Date.now() - start);
          // google_search no longer needs to force-route TextRouterMiddleware to Gemini.
          context.request.google_search = false;
          return await next();
        }
      } catch (err: any) {
        console.error(`[SearchRouter] ${provider.id} failed: ${err.message}`);
        provider.recordFailure(err.status || 500);
      }
    }

    console.warn('[SearchRouter] All search providers unavailable/failed; falling back to TextRouterMiddleware.');
    return await next();
  }
}
