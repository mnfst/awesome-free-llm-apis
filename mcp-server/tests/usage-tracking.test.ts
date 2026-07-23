import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMExecutor } from '../src/utils/LLMExecutor.js';
import { persistence } from '../src/utils/PersistenceManager.js';
import type { PipelineContext } from '../src/pipeline/index.js';
import { TaskType } from '../src/pipeline/index.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { BaseProvider } from '../src/providers/base.js';

class MockProvider extends BaseProvider {
    id = 'mock-provider';
    name = 'Mock Provider';
    baseURL = 'http://mock';
    envVar = 'MOCK_API_KEY';
    rateLimits = { rpm: 60 };
    models = [{ id: 'mock-model', name: 'Mock Model' }];
    
    async chat() {
        return {
            id: 'res-1',
            choices: [{ message: { role: 'assistant', content: 'hello' }, index: 0, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
            model: 'mock-model',
            object: 'chat.completion',
            created: Date.now()
        } as any;
    }
}

describe('Usage Tracking Hardening', () => {
    let executor: LLMExecutor;
    
    beforeEach(() => {
        executor = new LLMExecutor();
        const registry = ProviderRegistry.getInstance();
        (registry as any).providers = new Map();
        registry.registerProvider(new MockProvider());
    });

    it('should initialize local tracking counters even without API headers', async () => {
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        // Execute provider call
        await executor.tryProvider(context, 'mock-provider', 'mock-model');

        const state = executor.getTokenState()['mock-provider'];
        
        expect(state).toBeDefined();
        expect(state.localTotalRequests).toBe(1);
        expect(state.localTotalTokens).toBeGreaterThan(0);
        // remainingTokens should be undefined because no headers were returned by MockProvider
        expect(state.remainingTokens).toBeUndefined();
    });

    it('should accumulate local totals over multiple calls', async () => {
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        await executor.tryProvider(context, 'mock-provider', 'mock-model');
        await executor.tryProvider(context, 'mock-provider', 'mock-model');

        const state = executor.getTokenState()['mock-provider'];
        expect(state.localTotalRequests).toBe(2);
    });

    it('periodicPersistAndReset() zeroes accumulator counters but preserves live rate-limit fields', async () => {
        const context: PipelineContext = {
            request: { messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };
        await executor.tryProvider(context, 'mock-provider', 'mock-model');

        // Manually set fields that should survive a reset — live rate-limit state used for
        // routing decisions must not be wiped just because usage counters got flushed.
        const before = executor.getTokenState()['mock-provider'];
        before.remainingRequests = 42;
        before.remainingTokens = 4200;
        before.lastSuccessTime = Date.now();

        // persistStats()/save() touch real disk via the shared singleton — stub both so this
        // test stays isolated and fast, and to prove periodicPersistAndReset() always calls
        // resetBaseline() right after persisting (see PersistenceManager.resetBaseline doc).
        const persistStatsSpy = vi.spyOn(executor as any, 'persistStats').mockResolvedValue(undefined);
        const resetBaselineSpy = vi.spyOn(persistence, 'resetBaseline').mockImplementation(() => {});

        await (executor as any).periodicPersistAndReset();

        expect(persistStatsSpy).toHaveBeenCalled();
        expect(resetBaselineSpy).toHaveBeenCalled();

        const after = executor.getTokenState()['mock-provider'];
        expect(after.localTotalRequests).toBe(0);
        expect(after.localTotalTokens).toBe(0);
        expect(after.dailyTotalRequests || 0).toBe(0);
        expect(after.dailyTotalTokens || 0).toBe(0);
        // Live fields must survive — routing decisions depend on these staying current.
        expect(after.remainingRequests).toBe(42);
        expect(after.remainingTokens).toBe(4200);
        expect(after.lastSuccessTime).toBe(before.lastSuccessTime);

        persistStatsSpy.mockRestore();
        resetBaselineSpy.mockRestore();
    });
});
