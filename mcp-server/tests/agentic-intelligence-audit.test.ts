import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMExecutor } from '../src/utils/LLMExecutor.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { WorkspaceContextMiddleware } from '../src/pipeline/middlewares/WorkspaceContextMiddleware.js';
import { WorkspaceIndexer } from '../src/memory/indexer.js';

// Mock ProviderRegistry
vi.mock('../src/providers/registry.js', () => ({
    ProviderRegistry: {
        getInstance: vi.fn()
    }
}));

// Mock WorkspaceIndexer
const { mockIndexWorkspace } = vi.hoisted(() => ({
    mockIndexWorkspace: vi.fn().mockResolvedValue({ totalFiles: 10, indexedFiles: 5, skippedFiles: 5, errors: 0 })
}));

vi.mock('../src/memory/indexer.js', () => ({
    WorkspaceIndexer: class {
        indexWorkspace = mockIndexWorkspace;
    }
}));

// Mock ContextGatherer and others for Middleware test
vi.mock('../src/pipeline/middlewares/context-gatherer.js', () => ({
    ContextGatherer: {
        gatherContext: vi.fn().mockResolvedValue([])
    }
}));

vi.mock('../src/memory/index.js', () => ({
    memoryManager: {
        search: vi.fn().mockResolvedValue([]),
        getWiki: vi.fn().mockReturnValue({
            search: vi.fn().mockResolvedValue([]),
            write: vi.fn().mockResolvedValue({}),
        })
    }
}));

vi.mock('../src/cache/workspace.js', () => ({
    WorkspaceScanner: class {
        getWorkspaceHash = vi.fn().mockResolvedValue('test-hash');
    }
}));

describe('Agentic Intelligence Audit', () => {
    
    describe('LLMExecutor Model Prioritization', () => {
        let executor: LLMExecutor;
        let mockProvider: any;

        beforeEach(() => {
            vi.clearAllMocks();
            executor = new LLMExecutor();
            
            mockProvider = {
                id: 'gemini',
                models: [
                    { id: 'deepseek-ai/DeepSeek-V3' },
                    { id: 'gemini-3.1-flash-lite' },
                    { id: 'gemini-2.5-flash' },
                    { id: 'llama-3.3-70b-versatile' }
                ],
                chat: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'hello' } }]
                }),
                consecutiveFailures: 0,
                getUsageStats: () => ({ requestCountMinute: 0 }),
                rateLimits: { rpm: 60 }
            };

            (ProviderRegistry.getInstance as any).mockReturnValue({
                getAvailableProviders: () => [mockProvider],
                getProvider: () => mockProvider
            });
        });

        it('should prioritize gemini-2.5-flash when google_search is enabled', async () => {
            // When google_search is true, targetModels should be reordered
            // We can check which model was passed to the chat call
            await executor.prompt([{ role: 'user', content: 'test' }], 'any', { google_search: true });

            // With the update, gemini-3.1-flash-lite is prioritized for google_search (highest RPD)
            expect(mockProvider.chat).toHaveBeenCalledWith(expect.objectContaining({
                model: 'gemini-3.1-flash-lite',
                google_search: true
            }));
        });

        it('should prioritize DeepSeek-V3 when google_search is NOT enabled', async () => {
            await executor.prompt([{ role: 'user', content: 'test' }], 'any', { google_search: false });

            // Default order has DeepSeek-V3 first
            expect(mockProvider.chat).toHaveBeenCalledWith(expect.objectContaining({
                model: 'deepseek-ai/DeepSeek-V3',
                google_search: false
            }));
        });
    });

    describe('WorkspaceContextMiddleware Pre-emptive Indexing', () => {
        let middleware: WorkspaceContextMiddleware;

        beforeEach(() => {
            vi.clearAllMocks();
            middleware = new WorkspaceContextMiddleware();
        });

        it('should trigger indexing for agentic requests with a workspace', async () => {
            const context: any = {
                request: {
                    agentic: true,
                    messages: [{ role: 'user', content: 'hello' }]
                },
                workspaceRoot: '/test/root',
                sessionId: 'test-session'
            };
            const next = vi.fn();

            await middleware.execute(context, next);

            expect(mockIndexWorkspace).toHaveBeenCalledWith('/test/root', false);
            expect(next).toHaveBeenCalled();
        });

        it('should NOT trigger indexing for non-agentic requests', async () => {
            const context: any = {
                request: {
                    agentic: false,
                    messages: [{ role: 'user', content: 'hello' }]
                },
                workspaceRoot: '/test/root',
                sessionId: 'test-session'
            };
            const next = vi.fn();

            await middleware.execute(context, next);

            expect(mockIndexWorkspace).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });
    });
});
