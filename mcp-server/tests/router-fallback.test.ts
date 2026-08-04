import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    PipelineExecutor,
    TaskType,
    type PipelineContext,
    IntelligentRouterMiddleware
} from '../src/pipeline/index.js';
import { LLMExecutor } from '../src/utils/LLMExecutor.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import type { ChatResponse } from '../src/providers/types.js';

describe('Router Fallback Fix - Multiple next() Calls Bug', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        // Reset singleton
        (ProviderRegistry as any).instance = undefined;
    });

    it('should prioritize FREE models first for all task types', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');
        vi.stubEnv('GITHUB_TOKEN', 'test-github-token');

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        // Track which model is attempted first
        let firstModelAttempted: string | null = null;
        vi.spyOn(executor, 'tryProvider').mockImplementation(async (context, providerId, modelId) => {
            if (!firstModelAttempted) firstModelAttempted = modelId;
            return {
                id: 'resp-1',
                object: 'chat.completion',
                created: Date.now(),
                model: modelId,
                choices: [{ index: 0, message: { role: 'assistant', content: 'Success!' }, finish_reason: 'stop' }],
            } as ChatResponse;
        });

        // Test Coding task - should try FREE Qwen coder first
        const codingContext: PipelineContext = {
            request: { model: 'any', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Coding
        };
        await router.execute(codingContext, async () => { });
        expect(firstModelAttempted).toBe('qwen/qwen3-coder-480b-a35b:free');

        // Reset and test Chat task
        firstModelAttempted = null;
        const chatContext: PipelineContext = {
            request: { model: 'any', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };
        await router.execute(chatContext, async () => { });
        // Chat should try the first FREE model that has an available provider.
        // deepseek-ai/DeepSeek-R1 is on HuggingFace (not stubbed here), so the router
        // falls through to qwen/qwen3-coder-480b-a35b:free which is on OpenRouter (stubbed).
        expect(firstModelAttempted).toBe('qwen/qwen3-coder-480b-a35b:free');
    });

    it('should call next() exactly once even with multiple fallback attempts', async () => {
        // Setup: Multiple providers available, first one fails
        vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
        vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');

        const registry = ProviderRegistry.getInstance();
        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        // Mock executor to fail on first provider, succeed on second
        let callCount = 0;
        vi.spyOn(executor, 'tryProvider').mockImplementation(async (context, providerId, modelId) => {
            callCount++;
            if (callCount === 1) {
                // First provider fails
                throw new Error('Provider 1 failed');
            }
            // Second provider succeeds
            return {
                id: 'resp-1',
                object: 'chat.completion',
                created: Date.now(),
                model: modelId,
                choices: [{ index: 0, message: { role: 'assistant', content: 'Success!' }, finish_reason: 'stop' }],
            } as ChatResponse;
        });

        const context: PipelineContext = {
            request: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        // Track next() calls
        const nextSpy = vi.fn().mockImplementation(async () => {
            // Simulate downstream middleware doing nothing
        });

        await router.execute(context, nextSpy);

        // Verify: next() was called exactly ONCE despite multiple fallback attempts
        expect(nextSpy).toHaveBeenCalledTimes(1);
        expect(callCount).toBeGreaterThan(1); // Multiple providers were tried
        expect(context.response).toBeDefined();
        expect(context.response?.choices[0].message.content).toBe('Success!');
    });

    it('should try multiple fallback providers when first fails', async () => {
        vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
        vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        const attemptedProviders: string[] = [];
        vi.spyOn(executor, 'tryProvider').mockImplementation(async (context, providerId, modelId) => {
            attemptedProviders.push(providerId);
            if (attemptedProviders.length < 3) {
                throw new Error(`Provider ${providerId} failed`);
            }
            return {
                id: 'resp-success',
                object: 'chat.completion',
                created: Date.now(),
                model: modelId,
                choices: [{ index: 0, message: { role: 'assistant', content: 'Success on fallback!' }, finish_reason: 'stop' }],
            } as ChatResponse;
        });

        const context: PipelineContext = {
            request: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        await router.execute(context, async () => { });

        // Verify multiple providers were attempted
        expect(attemptedProviders.length).toBeGreaterThanOrEqual(3);
        expect(context.response).toBeDefined();
        expect(context.response?.choices[0].message.content).toBe('Success on fallback!');
    });

    it('should throw error when all fallback providers are exhausted', async () => {
        vi.stubEnv('GROQ_API_KEY', 'test-groq-key');

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        // Mock all providers to fail
        vi.spyOn(executor, 'tryProvider').mockRejectedValue(new Error('All providers failed'));

        const context: PipelineContext = {
            request: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        // Should throw comprehensive error
        await expect(router.execute(context, async () => { }))
            .rejects
            .toThrow(/Exhausted all fallback models/);
    });

    it('should preserve error messages from last failed provider', async () => {
        vi.stubEnv('GROQ_API_KEY', 'test-groq-key');

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        const lastErrorMessage = 'Specific provider error: Rate limit exceeded';
        vi.spyOn(executor, 'tryProvider').mockRejectedValue(new Error(lastErrorMessage));

        const context: PipelineContext = {
            request: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        await expect(router.execute(context, async () => { }))
            .rejects
            .toThrow(new RegExp(lastErrorMessage));
    });

    it('should work correctly in full pipeline without "next() called multiple times" error', async () => {
        vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
        vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        // Mock: First provider fails, second succeeds
        let attemptCount = 0;
        vi.spyOn(executor, 'tryProvider').mockImplementation(async (context, providerId, modelId) => {
            attemptCount++;
            if (attemptCount === 1) {
                throw new Error('First provider unavailable');
            }
            return {
                id: 'resp-final',
                object: 'chat.completion',
                created: Date.now(),
                model: modelId,
                choices: [{ index: 0, message: { role: 'assistant', content: 'Fallback success!' }, finish_reason: 'stop' }],
            } as ChatResponse;
        });

        const pipeline = new PipelineExecutor();

        // Add a middleware before router to verify pipeline flow
        const preMiddleware = {
            name: 'pre-router',
            execute: vi.fn().mockImplementation(async (ctx: PipelineContext, next: () => Promise<void>) => {
                await next();
            })
        };

        // Add a middleware after router to verify next() was called
        const postMiddleware = {
            name: 'post-router',
            execute: vi.fn().mockImplementation(async (ctx: PipelineContext, next: () => Promise<void>) => {
                await next();
            })
        };

        pipeline.use(preMiddleware);
        pipeline.use(router);
        pipeline.use(postMiddleware);

        const context: PipelineContext = {
            request: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        // Execute pipeline - should NOT throw "next() called multiple times"
        await expect(pipeline.execute(context)).resolves.toBeDefined();

        // Verify all middlewares were called
        expect(preMiddleware.execute).toHaveBeenCalledTimes(1);
        expect(postMiddleware.execute).toHaveBeenCalledTimes(1);
        expect(context.response).toBeDefined();
    });

    it('should skip providers without sufficient tokens', async () => {
        vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
        vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        const attemptedProviders: string[] = [];
        vi.spyOn(executor, 'tryProvider').mockImplementation(async (context, providerId, modelId) => {
            attemptedProviders.push(providerId);

            if (attemptedProviders.length === 1) {
                // First provider has insufficient tokens
                throw new Error('Exceeded tracked tokens');
            }

            // Second provider succeeds
            return {
                id: 'resp-tokens',
                object: 'chat.completion',
                created: Date.now(),
                model: modelId,
                choices: [{ index: 0, message: { role: 'assistant', content: 'Success with tokens!' }, finish_reason: 'stop' }],
            } as ChatResponse;
        });

        const context: PipelineContext = {
            request: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        await router.execute(context, async () => { });

        // Should have tried multiple providers due to token limit
        expect(attemptedProviders.length).toBeGreaterThanOrEqual(2);
        expect(context.response).toBeDefined();
    });

    it('should prioritize explicitly requested model before fallbacks', async () => {
        vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
        vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        const attemptedModels: string[] = [];
        vi.spyOn(executor, 'tryProvider').mockImplementation(async (context, providerId, modelId) => {
            attemptedModels.push(modelId);

            // Succeed on any attempt for this test
            return {
                id: 'resp-model',
                object: 'chat.completion',
                created: Date.now(),
                model: modelId,
                choices: [{ index: 0, message: { role: 'assistant', content: 'Response' }, finish_reason: 'stop' }],
            } as ChatResponse;
        });

        const context: PipelineContext = {
            request: { model: 'gemini-3.1-flash-lite', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        await router.execute(context, async () => { });

        // First attempted model should be the explicitly requested one
        expect(attemptedModels[0]).toBe('gemini-3.1-flash-lite');
    });

    it('should handle case when no providers are available', async () => {
        // Mock registry to return no available providers
        vi.spyOn(ProviderRegistry.getInstance(), 'getAvailableProviders').mockReturnValue([]);

        const executor = new LLMExecutor();
        const router = new IntelligentRouterMiddleware(executor);

        const context: PipelineContext = {
            request: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
            taskType: TaskType.Chat
        };

        // Should throw error about no available providers
        await expect(router.execute(context, async () => { }))
            .rejects
            .toThrow(/No available providers/);
    });
});
