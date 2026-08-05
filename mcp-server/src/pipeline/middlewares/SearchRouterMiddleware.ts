import type { Middleware, NextFunction, PipelineContext } from '../middleware.js';
import { TaskType } from '../middleware.js';
import { SearchProviderRegistry } from '../../search/registry.js';
import type { UnifiedSearchResult } from '../../search/types.js';

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
    const lines = results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`);
    const body = [
      answer ? `${answer}\n` : null,
      lines.length > 0 ? lines.join('\n\n') : '_No results found._',
    ].filter(Boolean).join('\n');

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
      try {
        const results = await provider.search(query);
        if (results.length > 0) {
          context.response = this.formatResponse(query, results, provider.id);
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
