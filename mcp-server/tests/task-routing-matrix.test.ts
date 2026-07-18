import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    TaskType,
    type PipelineContext,
    IntelligentRouterMiddleware
} from '../src/pipeline/index.js';
import { LLMExecutor } from '../src/utils/LLMExecutor.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { BaseProvider } from '../src/providers/base.js';

// Mock Provider implementation
class MockProvider extends BaseProvider {
    name: string;
    id: string;
    baseURL = 'http://mock';
    envVar: string;
    models: any[];
    rateLimits: any;

    constructor(id: string, models: any[]) {
        super();
        this.id = id;
        this.name = `Mock ${id}`;
        this.envVar = `${id.toUpperCase()}_API_KEY`;
        this.models = models.map(m => ({ 
            contextWindow: 128000, 
            ...m 
        }));
        this.rateLimits = { rpm: 1000 };
        vi.stubEnv(this.envVar, 'mock-key');
    }
    
    override getUsageStats() { 
        return { requestCountMinute: 0, requestCountDay: 0, tokenCountMinute: 0, tokenCountDay: 0 }; 
    }
    
    override isAvailable(): boolean { return true; }
}

describe('Intelligent Router - Task Intelligence Matrix', () => {
    let registry: ProviderRegistry;
    let executor: LLMExecutor;
    let router: IntelligentRouterMiddleware;

    beforeEach(() => {
        vi.unstubAllEnvs();
        (ProviderRegistry as any).instance = undefined;
        registry = ProviderRegistry.getInstance();
        executor = new LLMExecutor();
        router = new IntelligentRouterMiddleware(executor);

        // Register a provider that has MOST models from our routing map
        // This allows us to verify if the router picks the TOP suggested model when available
        const prov = new MockProvider('gemini', [
            { id: 'qwen/qwen3-coder-480b-a35b:free', name: 'Qwen3 Coder' },
            { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3' },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3' },
            { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4' },
            { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3' },
            { id: 'qwen3.5', name: 'Qwen 3.5' },
            { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash' }
        ]);
        registry.registerProvider(prov);
        
        vi.spyOn(executor, 'calculateTokens').mockReturnValue(500);
    });

    const verifyRouting = async (prompt: string, expectedType: TaskType, expectedModel: string) => {
        const context: PipelineContext = {
            request: {
                messages: [{ role: 'user', content: prompt }]
            }
        };

        const trySpy = vi.spyOn(executor, 'tryProvider').mockResolvedValue({ id: 'ok' } as any);

        await router.execute(context, async () => { });

        expect(context.taskType).toBe(expectedType);
        // It should try the expected model first (or one of the high-tier ones)
        expect(trySpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expectedModel, expect.any(Number));
    };

    it('should route Coding tasks correctly', async () => {
        await verifyRouting(
            'Write a high-performance Rust implementation of a priority queue.',
            TaskType.Coding,
            'qwen/qwen3-coder-480b-a35b:free'
        );
    });

    it('should route Reasoning tasks correctly', async () => {
        await verifyRouting(
            'Think step by step: if all bloops are bleeps and some bleeps are blops...',
            TaskType.Reasoning,
            'deepseek/deepseek-r1'
        );
    });

    it('should route Moderation tasks correctly', async () => {
        await verifyRouting(
            'Check this comment for any policy violations or safety concerns.',
            TaskType.Moderation,
            'google/gemma-4-31b-it:free'
        );
    });

    it('should route Summarization tasks correctly', async () => {
        await verifyRouting(
            'Summarize the key points of this research paper concisely.',
            TaskType.Summarization,
            'google/gemma-4-31b-it:free'
        );
    });

    it('should route Classification tasks correctly', async () => {
        await verifyRouting(
            'Classify the following customer feedback as positive, neutral, or negative.',
            TaskType.Classification,
            'google/gemma-4-31b-it:free'
        );
    });

    it('should route Semantic Search tasks correctly', async () => {
        await verifyRouting(
            'Search for recent breakthroughs in room-temperature superconductivity.',
            TaskType.SemanticSearch,
            'gemini-3.1-flash-lite'
        );
    });


    it('should route Entity Extraction tasks correctly', async () => {
        await verifyRouting(
            'Parse the following text and extract names, dates, and locations in JSON format.',
            TaskType.EntityExtraction,
            'google/gemma-4-31b-it:free'
        );
    });

    it('should route User Intent tasks correctly', async () => {
        await verifyRouting(
            'What are your main capabilities and how can you help me today?',
            TaskType.UserIntent,
            'google/gemma-4-31b-it:free'
        );
    });

    it('should route general Chat tasks correctly', async () => {
        await verifyRouting(
            'Hello! How is your day going?',
            TaskType.Chat,
            'deepseek/deepseek-r1'
        );
    });

    it('should route Cyber security tasks correctly', async () => {
        await verifyRouting(
            'We need to write an exploit to solve this buffer overflow ctf vulnerability.',
            TaskType.Cyber,
            'deepseek/deepseek-r1'
        );
    });

    it('should prioritize explicit keywords even with conflicting content', async () => {
        const context: PipelineContext = {
            request: {
                messages: [{ role: 'user', content: 'Who are you? summarize this.' }]
            },
            keywords: ['code'] // Explicitly tagged as code
        };

        const trySpy = vi.spyOn(executor, 'tryProvider').mockResolvedValue({ id: 'ok' } as any);
        await router.execute(context, async () => { });

        expect(context.taskType).toBe(TaskType.Coding);
        expect(trySpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'qwen/qwen3-coder-480b-a35b:free', expect.any(Number));
    });
});
