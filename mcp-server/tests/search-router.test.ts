import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchRouterMiddleware } from '../src/pipeline/middlewares/SearchRouterMiddleware.js';
import { SearchProviderRegistry } from '../src/search/registry.js';
import { TaskType, type PipelineContext } from '../src/pipeline/middleware.js';

describe('SearchRouterMiddleware', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        (SearchProviderRegistry as any).instance = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('passes through untouched when no search is requested', async () => {
        const middleware = new SearchRouterMiddleware();
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'hello' }] },
        };
        let nextCalled = false;
        await middleware.execute(context, async () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(context.response).toBeUndefined();
    });

    it('short-circuits with a formatted response on first successful provider', async () => {
        vi.stubEnv('TAVILY_API_KEY', 'a-real-looking-tavily-key');
        const registry = SearchProviderRegistry.getInstance();
        const providers = registry.getProviders();
        const parallel = providers.find(p => p.id === 'parallel')!;
        const tavily = providers.find(p => p.id === 'tavily')!;

        vi.spyOn(parallel, 'search').mockRejectedValue(Object.assign(new Error('429'), { status: 429 }));
        vi.spyOn(tavily, 'search').mockResolvedValue([
            { provider: 'tavily', title: 'Result A', url: 'https://a.example', snippet: 'snippet A', answer: 'The answer' },
        ]);

        const middleware = new SearchRouterMiddleware();
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'what is the capital of France' }], google_search: true },
        };
        let nextCalled = false;
        await middleware.execute(context, async () => { nextCalled = true; });

        expect(nextCalled).toBe(true);
        expect(context.response).toBeDefined();
        expect(context.response!.model).toBe('search:tavily');
        expect(context.response!.choices[0].message.content).toContain('Result A');
        expect(context.response!.choices[0].message.content).toContain('The answer');
        // google_search should be cleared so TextRouterMiddleware doesn't re-force Gemini
        expect(context.request.google_search).toBe(false);
    });

    it('triggers on TaskType.SemanticSearch even without the google_search flag', async () => {
        const registry = SearchProviderRegistry.getInstance();
        const parallel = registry.getProviders().find(p => p.id === 'parallel')!;
        vi.spyOn(parallel, 'search').mockResolvedValue([
            { provider: 'parallel', title: 'Result P', url: 'https://p.example', snippet: 'snippet P' },
        ]);

        const middleware = new SearchRouterMiddleware();
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'research query' }] },
            taskType: TaskType.SemanticSearch,
        };
        await middleware.execute(context, async () => {});
        expect(context.response!.model).toBe('search:parallel');
    });

    it('falls through to next() without setting a response when every provider fails/unavailable', async () => {
        const registry = SearchProviderRegistry.getInstance();
        for (const provider of registry.getProviders()) {
            vi.spyOn(provider, 'search').mockRejectedValue(Object.assign(new Error('down'), { status: 500 }));
        }
        // Force parallel (keyless) to be the only "available" one so the loop actually runs and fails.
        const middleware = new SearchRouterMiddleware();
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'query' }], google_search: true },
        };
        let nextCalled = false;
        await middleware.execute(context, async () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(context.response).toBeUndefined();
        // google_search must remain true so TextRouterMiddleware's Gemini fallback still fires
        expect(context.request.google_search).toBe(true);
    });

    it('does not run again if a response is already set upstream', async () => {
        const middleware = new SearchRouterMiddleware();
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'x' }], google_search: true },
            response: {
                id: 'x', object: 'chat.completion', created: 0, model: 'cached',
                choices: [{ index: 0, message: { role: 'assistant', content: 'cached' }, finish_reason: 'stop' }],
            },
        };
        const searchSpy = vi.spyOn(SearchProviderRegistry.getInstance(), 'getAvailableProviders');
        await middleware.execute(context, async () => {});
        expect(searchSpy).not.toHaveBeenCalled();
        expect(context.response!.model).toBe('cached');
    });
});

describe('SearchProviderRegistry availability', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        (SearchProviderRegistry as any).instance = undefined;
    });
    afterEach(() => vi.unstubAllEnvs());

    it('treats Parallel AI as always available (keyless)', () => {
        const registry = SearchProviderRegistry.getInstance();
        const parallel = registry.getProviders().find(p => p.id === 'parallel')!;
        expect(parallel.isAvailable()).toBe(true);
    });

    it('gates Tavily/Brave/Jina-key-bonus behind their env vars', () => {
        const registry = SearchProviderRegistry.getInstance();
        const tavily = registry.getProviders().find(p => p.id === 'tavily')!;
        expect(tavily.isAvailable()).toBe(false);
        vi.stubEnv('TAVILY_API_KEY', 'a-real-looking-tavily-key');
        expect(tavily.isAvailable()).toBe(true);
    });

    it('gates SearXNG behind SEARXNG_BASE_URL', () => {
        const registry = SearchProviderRegistry.getInstance();
        const searxng = registry.getProviders().find(p => p.id === 'searxng')!;
        expect(searxng.isAvailable()).toBe(false);
        vi.stubEnv('SEARXNG_BASE_URL', 'http://localhost:8080');
        expect(searxng.isAvailable()).toBe(true);
    });

    it('rejects placeholder-looking API keys', () => {
        const registry = SearchProviderRegistry.getInstance();
        const brave = registry.getProviders().find(p => p.id === 'brave')!;
        vi.stubEnv('BRAVE_API_KEY', 'your_brave_api_key_here');
        expect(brave.isAvailable()).toBe(false);
    });
});
