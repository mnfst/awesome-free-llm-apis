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
            {
                provider: 'tavily',
                title: 'Result A',
                url: 'https://a.example',
                snippet: 'snippet A',
                answer: 'The answer',
                fullContent: '## Deep Section\n\nThis is the full article.',
            },
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
        expect(context.response!.choices[0].message.content).toContain('Deep Section');
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

    it('gates Tavily/Jina-key-bonus behind their env vars', () => {
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
        const tavily = registry.getProviders().find(p => p.id === 'tavily')!;
        vi.stubEnv('TAVILY_API_KEY', 'your_tavily_api_key_here');
        expect(tavily.isAvailable()).toBe(false);
    });

    it('does NOT include Brave in the provider registry', () => {
        const registry = SearchProviderRegistry.getInstance();
        const brave = registry.getProviders().find(p => p.id === 'brave');
        expect(brave).toBeUndefined();
    });
});

describe('JinaSearchProvider — intelligent extraction', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        (SearchProviderRegistry as any).instance = undefined;
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('enriches results with fullContent via Jina Reader after search', async () => {
        const { JinaSearchProvider } = await import('../src/search/providers/jina.js');
        const provider = new JinaSearchProvider();

        const fetchMock = vi.fn();

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    { title: 'Result 1', url: 'https://example.com/1', content: 'short snippet 1' },
                    { title: 'Result 2', url: 'https://example.com/2', content: 'short snippet 2' },
                ],
            }),
        });

        fetchMock.mockResolvedValueOnce({
            ok: true,
            text: async () => '# Full Article 1\n\nDetailed content here.',
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            text: async () => '# Full Article 2\n\nMore detailed content.',
        });

        (provider as any).fetchImpl = fetchMock;

        const results = await provider.search('test query', 2);
        expect(results[0].fullContent).toContain('Full Article 1');
        expect(results[1].fullContent).toContain('Full Article 2');
        expect(results[0].snippet).toBe('short snippet 1');
    });

    it('gracefully skips extraction if Reader call fails', async () => {
        const { JinaSearchProvider } = await import('../src/search/providers/jina.js');
        const provider = new JinaSearchProvider();

        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [{ title: 'R', url: 'https://example.com', content: 'snip' }],
            }),
        });
        fetchMock.mockRejectedValueOnce(new Error('network timeout'));

        (provider as any).fetchImpl = fetchMock;

        const results = await provider.search('test', 1);
        expect(results[0].snippet).toBe('snip');
        expect(results[0].fullContent).toBeUndefined();
    });
});

describe('TavilySearchProvider — intelligent extraction', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        (SearchProviderRegistry as any).instance = undefined;
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('enriches results with fullContent via Tavily Extract after search', async () => {
        vi.stubEnv('TAVILY_API_KEY', 'a-real-tavily-key-123456');
        const { TavilySearchProvider } = await import('../src/search/providers/tavily.js');
        const provider = new TavilySearchProvider();
        const fetchMock = vi.fn();

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                answer: 'The answer',
                results: [
                    { title: 'T1', url: 'https://t.example/1', content: 'snippet 1', score: 0.9 },
                    { title: 'T2', url: 'https://t.example/2', content: 'snippet 2', score: 0.7 },
                ],
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    { url: 'https://t.example/1', raw_content: '# Full page 1\n\nDeep content here.' },
                    { url: 'https://t.example/2', raw_content: '# Full page 2\n\nMore deep content.' },
                ],
            }),
        });

        (provider as any).fetchImpl = fetchMock;

        const results = await provider.search('AI ethics', 2);
        expect(results[0].fullContent).toContain('Full page 1');
        expect(results[1].fullContent).toContain('Full page 2');
        expect(results[0].snippet).toBe('snippet 1');
        expect(results[0].answer).toBe('The answer');

        const body = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(body.urls).toEqual(['https://t.example/1', 'https://t.example/2']);
        expect(body.query).toBe('AI ethics');
        expect(body.chunks_per_source).toBe(4);
    });

    it('skips extraction gracefully if Extract call fails', async () => {
        vi.stubEnv('TAVILY_API_KEY', 'a-real-tavily-key-123456');
        const { TavilySearchProvider } = await import('../src/search/providers/tavily.js');
        const provider = new TavilySearchProvider();
        const fetchMock = vi.fn();

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [{ title: 'T', url: 'https://t.example', content: 'snip', score: 0.8 }],
            }),
        });
        fetchMock.mockRejectedValueOnce(new Error('extract timeout'));

        (provider as any).fetchImpl = fetchMock;

        const results = await provider.search('query', 1);
        expect(results[0].snippet).toBe('snip');
        expect(results[0].fullContent).toBeUndefined();
    });
});

describe('TinyFishSearchProvider — two-phase extraction', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        (SearchProviderRegistry as any).instance = undefined;
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('executes search and enriches with fetch content when API key is provided', async () => {
        vi.stubEnv('TINYFISH_API_KEY', 'tf-valid-api-key-12345');
        const { TinyFishSearchProvider } = await import('../src/search/providers/tinyfish.js');
        const provider = new TinyFishSearchProvider();

        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    { title: 'TF Result 1', url: 'https://tf.example/1', snippet: 'tf snippet 1' },
                ],
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            text: async () => '# TinyFish Full Article 1',
        });

        (provider as any).fetchImpl = fetchMock;

        const results = await provider.search('test query', 1);
        expect(results[0].title).toBe('TF Result 1');
        expect(results[0].fullContent).toContain('TinyFish Full Article 1');
    });
});

describe('DdgsMcpSearchProvider & parseDdgSearchResults', () => {
    it('parses formatted string output correctly', async () => {
        const { parseDdgSearchResults } = await import('../src/search/providers/ddgs.js');
        const raw = `Found 2 search results:\n\n1. First Title\n   URL: https://ddg.example/1\n   Summary: First summary text\n\n2. Second Title\n   URL: https://ddg.example/2\n   Summary: Second summary text`;

        const parsed = parseDdgSearchResults(raw);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].title).toBe('First Title');
        expect(parsed[0].url).toBe('https://ddg.example/1');
        expect(parsed[0].snippet).toBe('First summary text');
    });

    it('performs search and fetch_content using injected client', async () => {
        const { DdgsMcpSearchProvider } = await import('../src/search/providers/ddgs.js');
        const provider = new DdgsMcpSearchProvider();

        const fakeClient = {
            callTool: vi.fn().mockImplementation(async (req) => {
                if (req.name === 'search') {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Found 1 search results:\n\n1. DDG Item\n   URL: https://ddg.test/1\n   Summary: DDG snippet',
                            },
                        ],
                    };
                }
                if (req.name === 'fetch_content') {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: '# Extracted DDG Content',
                            },
                        ],
                    };
                }
                return {};
            }),
            close: vi.fn(),
        };

        provider.setClient(fakeClient as any);

        const results = await provider.search('query', 1);
        expect(results[0].title).toBe('DDG Item');
        expect(results[0].fullContent).toBe('# Extracted DDG Content');
    });
});




