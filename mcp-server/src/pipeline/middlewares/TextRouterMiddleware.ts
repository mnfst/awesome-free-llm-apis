import { Middleware, PipelineContext, NextFunction, TaskType } from '../middleware.js';
import { LLMExecutor } from '../../utils/LLMExecutor.js';
import { ContextManager } from '../../utils/ContextManager.js';
import { PromptCompressor } from '../../utils/PromptCompressor.js';
import { getMessageContent, prependToMessageContent, isUserConfused } from '../../utils/MessageUtils.js';
import { TaskClassifier } from '../../utils/TaskClassifier.js';
import { calculateModelWeightedMaxTokens } from '../../utils/model-tokens.js';
import { ProviderRegistry } from '../../providers/registry.js';
import { ChatResponse, Message } from '../../providers/types.js';
import {
    getModelCapability,
    getModelContextLimit,
    isReasoningModel,
    isCoderModel,
    isVisionOnlyModel
} from '../../config/models.js';

export class TextRouterMiddleware implements Middleware {
    name = 'TextRouterMiddleware';
    private executor: LLMExecutor;
    private contextManager: ContextManager;
    private promptCompressor: PromptCompressor;

    constructor(executor?: LLMExecutor) {
        this.executor = executor || new LLMExecutor();
        this.contextManager = new ContextManager();
        this.promptCompressor = new PromptCompressor(this.executor, this.contextManager);
    }

    public async init(): Promise<void> {
        await this.executor.init();
    }

    public getExecutor(): LLMExecutor {
        return this.executor;
    }

    public getTokenState() {
        return this.executor.getTokenState();
    }

    public flush(): void {
        this.executor.flush();
    }

    public async persistNow(): Promise<void> {
        await this.executor.persistNow();
    }

    public static readonly taskRouteMap: Record<TaskType, string[]> = {
        [TaskType.Reasoning]: [
            'deepseek/deepseek-r1',
            'deepseek-ai/DeepSeek-R1',
            'deepseek-ai/deepseek-r1-distill-qwen-32b',
            'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
            'liquid/lfm2.5-1.2b-thinking:free',
            'microsoft/phi-4-mini-reasoning',
            'command-a-plus-05-2026',
            'command-a-reasoning-08-2025',
            'zai-org/GLM-5.1',
            'qwen/qwen3-coder:free',
            'google/gemma-4-26b-a4b-it:free',
            'google/gemma-4-31b-it:free',
            'google/gemma-4-31B-it',
            'gemma-4-31b-it',
            'gemma-4-26b-a4b-it',
            'google/gemma-4-26B-A4B-it',
            'nvidia/nemotron-3-super-120b-a12b:free',
            'mistralai/mistral-nemotron',
            'microsoft/phi-4-multimodal-instruct',
            'bytedance/seed-oss-36b-instruct',
            'minimaxai/minimax-m2.7',
            'nvidia/nemotron-3-ultra-550b-a55b',
            '@cf/meta/llama-4-scout-17b-16e-instruct',
            'meta/llama-4-scout-17b-16e-instruct',
            'deepseek-ai/DeepSeek-V4-Pro',
            'Qwen/Qwen3.5-397B-A17B',
        ],
        [TaskType.Coding]: [
            'qwen/qwen3-coder-480b-a35b-instruct',
            'qwen/qwen3-coder-480b-a35b:free',
            'qwen3-coder:480b',
            'qwen3-coder-next',
            'qwen/qwen3-coder:free',
            'deepseek-ai/deepseek-r1-distill-qwen-32b',
            'openai/gpt-oss-120b',
            'qwen/qwen3-32b',
            'google/gemma-4-26b-a4b-it:free',
            'google/gemma-4-31b-it:free',
            'google/gemma-4-31B-it',
            'google/gemma-4-26B-A4B-it',
            'meta/llama-4-maverick-17b-128e-instruct-fp8',
            'meta/llama-4-maverick-17b-128e-instruct',
            'meta-llama/llama-4-maverick:free',
            'mistralai/mistral-large-3-675b-instruct-2512',
            'mistral-ai/codestral-2501',
            'codestral-latest',
            'open-mistral-nemo',
            '@cf/qwen/qwen2.5-coder-32b-instruct',
            '@cf/qwen/qwq-32b',
            'gpt-oss:20b',
            'gemini-3.1-flash-lite',
            'mistral-large-latest',
            'openai/gpt-oss-120b:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'zai-org/GLM-5.1',
            'z-ai/glm-4.5-air:free',
            'gemma-4-31b-it',
            'gemma-4-26b-a4b-it',
            'kilo-auto/free',
            'bytedance/seed-oss-36b-instruct',
            'microsoft/phi-4-multimodal-instruct',
            'mistralai/mistral-nemotron',
            'minimaxai/minimax-m2.7',
            '@cf/google/gemma-4-26b-a4b-it',
            'mistral-medium-latest',
            '@cf/mistralai/mistral-small-3.1-24b-instruct',
            'Qwen/Qwen3-Coder-30B-A3B-Instruct',
            'deepseek-ai/DeepSeek-V4-Pro',
            'cohere/north-mini-code:free',
        ],
        [TaskType.Vision]: [
            'nvidia/nemotron-nano-12b-v2-vl:free',
            'gemma-4-31b-it',
            'gemma-4-26b-a4b-it',
            'gemini-3.1-flash-lite',
            'meta-llama/llama-4-maverick:free',
            'c4ai-aya-vision-32b',
            'command-a-plus-05-2026',
            '@cf/meta/llama-4-scout-17b-16e-instruct',
            'meta/llama-4-scout-17b-16e-instruct',
            'glm-4.6V-flash',
            'stepfun-ai/step-3.7-flash',
            'Qwen/Qwen3.5-397B-A17B',
            'Qwen/Qwen3-VL-235B-A22B-Instruct',
            'stepfun-ai/Step-3.5-Flash',
        ],
        [TaskType.Classification]: [
            'google/gemma-4-31b-it:free',
            'google/gemma-4-31B-it',
            'google/gemma-3-27b-it',
            'gemma-4-31b-it',
            'llama-3.3-70b-versatile',
            'Qwen/Qwen2.5-72B-Instruct',
            'gemini-3.1-flash-lite',
            'mistral-small-latest',
            'z-ai/glm-4.5-air:free',
            'nvidia/nemotron-3-nano-30b-a3b:free',
            'google/gemma-3n-e2b-it',
            'google/gemma-3n-e4b-it',
            'openai/gpt-5-mini',
            'deepseek-v4-flash',
            'openai/gpt-4.1-mini',
            'deepseek/deepseek-v3-0324',
            'zai-glm-4.7',
            'glm-4.7-flash',
            'glm-4.5-flash',
            'zai-org/GLM-5.2',
            'deepseek-ai/DeepSeek-V4-Flash',
            'zai-org/GLM-4.7-Flash',
        ],
        [TaskType.UserIntent]: [
            'google/gemma-4-31b-it:free',
            'google/gemma-4-31B-it',
            'gemma-4-31b-it',
            'mistral-small-latest',
            'Qwen/Qwen2.5-72B-Instruct',
            'gemini-3.1-flash-lite',
            'llama-3.3-70b-versatile',
            'z-ai/glm-4.5-air:free',
            'nvidia/nemotron-mini-4b-instruct:free',
            'nvidia/nemotron-mini-4b-instruct',
            'openai/gpt-5-mini',
            'deepseek-v4-flash',
            'openai/gpt-4.1-mini',
            'deepseek/deepseek-v3-0324',
            'glm-4.7-flash',
            'glm-4.5-flash',
            'zai-org/GLM-5.2',
            'deepseek-ai/DeepSeek-V4-Flash',
            'zai-org/GLM-4.7-Flash',
        ],
        [TaskType.SemanticSearch]: [
            'google/gemma-4-31b-it:free',
            'google/gemma-4-31B-it',
            'google/gemma-3-27b-it',
            'gemma-4-31b-it',
            'nvidia/nemotron-3-super-120b-a12b:free',
            'arcee-ai/trinity-large-preview:free',
            'qwen/qwen3-next-80b-a3b-instruct:free',
            'Qwen/Qwen2.5-72B-Instruct',
            'meta-llama/llama-4-scout-17b-16e-instruct',
            'command-r-plus-08-2024',
            'gemini-3.1-flash-lite',
            'mistral-large-latest',
            'openai/gpt-oss-120b:free',
            'llama-3.3-70b-versatile',
            'z-ai/glm-4.5-air:free',
            'qwen3-235b',
            'openai/gpt-4o',
            'openai/gpt-5-mini',
            'deepseek-v4-flash',
            'gemma4:31b',
            'openai/gpt-4.1-mini',
            'deepseek/deepseek-v3-0324',
            'deepseek-ai/DeepSeek-V3.2',
            'zai-org/GLM-5',
        ],
        [TaskType.Summarization]: [
            'google/gemma-4-31b-it:free',
            'google/gemma-4-31B-it',
            'google/gemma-3-27b-it',
            'gemma-4-31b-it',
            'kimi-k2.6',
            'mistral-small-latest',
            'gemini-3.1-flash-lite',
            'gemma-4-26b-a4b-it',
            'mistralai/Mistral-7B-Instruct-v0.3',
            'Qwen/Qwen2.5-72B-Instruct',
            'meta-llama/Llama-3.3-70B-Instruct',
            'command-a-03-2025',
            'openai/gpt-5-mini',
            'mistralai/mistral-small-3.1-24b:free',
            'glm-4.7',
            'z-ai/glm-4.5-air:free',
            'microsoft/phi-4-mini-reasoning',
            'openai/gpt-4o',
            'openai/gpt-4o-mini',
            'openai/gpt-4.1-mini',
            'deepseek/deepseek-v3-0324',
            'mistral-ai/mistral-small-2503',
            'command-r7b-12-2024',
            'gpt-oss-120b',
            'meta/llama-4-maverick-17b-128e-instruct-fp8',
            'zai-glm-4.7',
            '@cf/moonshotai/kimi-k2.6',
            '@cf/mistralai/mistral-small-3.1-24b-instruct',
            'glm-4.7-flash',
            'glm-4.5-flash',
            'zai-org/GLM-5',
            'deepseek-ai/DeepSeek-V4-Flash',
            'zai-org/GLM-4.7-Flash',
        ],
        [TaskType.EntityExtraction]: [
            'gpt-oss-120b',
            'google/gemma-4-31b-it:free',
            'gemma-4-31b-it',
            'google/gemma-4-31B-it',
            'arcee-ai/trinity-large-preview:free',
            'llama-3.3-70b-versatile',
            'mistral-ai/codestral-2501',
            'meta/llama-4-maverick-17b-128e-instruct-fp8',
            'Qwen/Qwen2.5-72B-Instruct',
            'gemini-3.1-flash-lite',
            'glm-4.7',
            'z-ai/glm-4.5-air:free',
            'openai/gpt-5-mini',
            'gemma-4-26b-a4b-it',
            'stepfun-ai/step-3.5-flash',
            'stepfun-ai/step-3.7-flash',
            'microsoft/phi-4-mini-reasoning',
            'openai/gpt-4o',
            'openai/gpt-4o-mini',
            'openai/gpt-4.1-mini',
            'deepseek/deepseek-v3-0324',
            'mistral-ai/mistral-small-2503',
            'zai-org/GLM-5.2',
            'deepseek-ai/DeepSeek-V4-Flash',
        ],
        [TaskType.Moderation]: [
            'google/gemma-4-31b-it:free',
            'google/gemma-4-31B-it',
            'google/gemma-3-27b-it',
            'gemma-4-31b-it',
            'llama-3.3-70b-versatile',
            'gemini-3.1-flash-lite',
            'mistral-large-latest',
            'openai/gpt-oss-120b:free',
            'z-ai/glm-4.5-air:free',
            'mistral-medium-latest',
            'qwen3-235b',
            'openai/gpt-4o',
            'openai/gpt-5-mini',
            'deepseek-v4-flash',
            'gemma4:31b',
            'openai/gpt-4.1-mini',
            'deepseek/deepseek-v3-0324',
            '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
            'zai-org/GLM-4.7-Flash',
        ],
        [TaskType.Cyber]: [
            'deepseek/deepseek-r1',
            'deepseek/deepseek-v3-0324',
            'deepseek-v4-flash',
            'qwen3-coder:480b',
            'qwen/qwen3-coder-480b-a35b:free',
            'mistral-ai/codestral-2501',
            'devstral-2:123b',
            'devstral-small-2:24b',
            'openai/gpt-5-mini',
            'openai/gpt-4o',
            'gemma4:31b',
            'mistral-ai/mistral-small-2503',
        ],
        [TaskType.Chat]: [
            'deepseek/deepseek-r1',
            'deepseek-ai/DeepSeek-R1',
            'nvidia/nemotron-3-super-120b-a12b:free',
            'google/gemma-4-31b-it:free',
            'google/gemma-4-26b-a4b-it:free',
            'openai/gpt-oss-20b:free',
            'meta/llama-3.3-70b-instruct',
            'Qwen/Qwen2.5-72B-Instruct',
            'c4ai-aya-expanse-32b',
            'openai/gpt-oss-120b:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'openai/gpt-4o',
            'google/gemma-3n-e2b-it',
            'google/gemma-3n-e4b-it',
            'stepfun-ai/step-3.5-flash',
            'stepfun-ai/step-3.7-flash',
            'minimaxai/minimax-m2.7',
            'mistralai/mistral-nemotron',
            'bytedance/seed-oss-36b-instruct',
            'microsoft/phi-4-multimodal-instruct',
            'Qwen/Qwen3-8B',
            'arcee-ai/trinity-mini:free',
            'nvidia/nemotron-nano-12b-v2-vl:free',
            'nvidia/nemotron-nano-9b-v2:free',
            'openrouter/free',
            'llama-3.1-8b-instant',
            'gemini-3.1-flash-lite',
            'gemma-4-26b-a4b-it',
            'open-mistral-nemo',
            'qwen3-235b',
            'microsoft/phi-4-mini-reasoning',
            'openai/gpt-5-mini',
            'gpt-oss:20b',
            'gpt-oss:120b',
            'nemotron-3-nano:30b',
            'nemotron-3-super',
            'nemotron-3-ultra',
            'openai/gpt-4o-mini',
            'kimi-k2.6',
            'minimax-m2.1',
            'minimax-m2.5',
            'minimax-m2.7',
            'minimax-m3',
            'ministral-3:3b',
            'ministral-3:8b',
            'ministral-3:14b',
            'meta/llama-4-maverick-17b-128e-instruct-fp8',
            'gemma3:4b',
            'gemma3:12b',
            'gemma3:27b',
            'gemma4:31b',
            'deepseek-v4-flash',
            'rnj-1:8b',
            'openai/gpt-4.1-mini',
            'deepseek/deepseek-v3-0324',
            'mistral-ai/mistral-small-2503',
            'openai/gpt-oss-20b:free',
            'zai-glm-4.7',
            '@cf/google/gemma-4-26b-a4b-it',
            '@cf/google/gemma-3-12b-it',
            '@cf/moonshotai/kimi-k2.6',
            'ministral-8b-latest',
            'glm-4.7-flash',
            'glm-4.5-flash',
            'glm-4.6V-flash',
            'zai-org/GLM-5.2',
            'zai-org/GLM-5.1',
            'zai-org/GLM-5',
            'zai-org/GLM-4.7-Flash',
            'stepfun-ai/step-3.7-flash',
            'deepseek-ai/DeepSeek-V4-Pro',
            'deepseek-ai/DeepSeek-V4-Flash',
            'deepseek-ai/DeepSeek-V3.2',
            'Qwen/Qwen3-Coder-30B-A3B-Instruct',
            'Qwen/Qwen3-8B',
            'stepfun-ai/Step-3.5-Flash',
        ]
    };



    private isComplex(messages: Message[]): boolean {
        if (messages.length < 1) return false;
        const lastMsg = getMessageContent(messages[messages.length - 1]);
        const lines = lastMsg.split('\n');
        
        let stepCount = 0;
        for (const line of lines) {
            if (/^\s*(?:\d+\.|\*|-)\s+(?:[Ss]tep|[Pp]hase)/.test(line)) {
                stepCount++;
            }
        }
        return stepCount >= 2;
    }

    private async decomposeAndExecute(context: PipelineContext): Promise<void> {
        const lastMsg = getMessageContent(context.request.messages[context.request.messages.length - 1]);
        
        const planningMessages = [
            {
                role: 'system' as const,
                content: 'Decompose the user request into a JSON array of strings representing sequential subtasks.'
            },
            {
                role: 'user' as const,
                content: lastMsg
            }
        ];
        
        const planResponse = await this.executor.prompt(planningMessages);
        
        const planContent = planResponse.choices?.[0]?.message?.content || '[]';
        let subtasks: any[] = [];
        try {
            const parsed = JSON.parse(planContent);
            subtasks = Array.isArray(parsed) ? parsed : (parsed.tasks || parsed.subtasks || []);
        } catch {
            subtasks = [lastMsg];
        }

        if (subtasks.length < 2) return;

        let accumulatedContext = '';
        const originalModel = context.request.model;

        for (let i = 0; i < subtasks.length; i++) {
            const task = subtasks[i];
            const taskStr = typeof task === 'string' ? task : (task.task || task.description || JSON.stringify(task));
            
            const subtaskMessages = [
                ...context.request.messages.slice(0, -1),
                {
                    role: 'user' as const,
                    content: `Subtask ${i + 1}/${subtasks.length}: ${taskStr}\n\nAccumulated Context:\n${accumulatedContext}\n\nExecute this subtask.`
                }
            ];

            const response = await this.executor.prompt(subtaskMessages, originalModel || 'any');

            if (response && response.choices?.[0]?.message?.content) {
                accumulatedContext += `\n\n### Output of Subtask ${i + 1} (${taskStr}):\n${response.choices[0].message.content}`;
            }
        }

        context.response = {
            id: `decomposed-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: originalModel || 'decomposed-orchestrator',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: `## Decomposed Execution Results\n\nAll subtasks have been completed successfully. Here is the compiled output:\n${accumulatedContext}`
                },
                finish_reason: 'stop'
            }]
        };
    }

    async execute(context: PipelineContext, next: NextFunction): Promise<void> {
        if (context.response) {
            return await next();
        }

        await this.executeInternal(context);
        await next();
    }

    public async executeInternal(context: PipelineContext): Promise<void> {
        if (!context.request.messages || context.request.messages.length === 0) {
            throw new Error('Message array is empty or undefined');
        }

        const inferredType = TaskClassifier.autoClassify(context.request.messages, context.keywords);
        if (inferredType === TaskType.Vision || !context.taskType) {
            context.taskType = inferredType;
            console.debug(`[Router] task type set to: ${context.taskType}`);
        }

        if (context.taskType === TaskType.SemanticSearch && !context.request.google_search) {
            console.debug(`[Router] Enabling google_search for research task`);
            context.request.google_search = true;
        }

        if (!context.isOnePass && this.isComplex(context.request.messages)) {
            await this.decomposeAndExecute(context);
            if (context.response) return;
        }

        const taskType = context.taskType || TaskType.Chat;
        const requestedModel = context.request.model;
        const tierModels = (requestedModel && requestedModel !== 'any')
            ? [requestedModel, ...(TextRouterMiddleware.taskRouteMap[taskType] || [])]
            : (TextRouterMiddleware.taskRouteMap[taskType] || []);

        let finalTierModels = [...new Set(tierModels)].filter(Boolean) as string[];

        const availableProviders = ProviderRegistry.getInstance().getAvailableProviders();
        if (availableProviders.length === 0) {
            throw new Error('No available providers. Please check your API keys.');
        }

        if (taskType === TaskType.Chat && finalTierModels.length < 100) {
             const allAvailable = availableProviders.flatMap(p => p.models.map(m => m.id));
             finalTierModels = [...new Set([...finalTierModels, ...allAvailable])];
        }

        if (context.request.google_search) {
            const geminiModels = finalTierModels.filter(m => m.toLowerCase().includes('gemini'));
            const otherModels = finalTierModels.filter(m => !m.toLowerCase().includes('gemini'));
            const geminiAvailable = availableProviders.some(p => p.id === 'gemini' && !this.executor.getProviderStats()['gemini']?.circuitOpen);

            if (geminiAvailable) {
                finalTierModels = [...geminiModels, ...otherModels];
                console.debug(`[Router] Prioritizing Gemini models for search: ${geminiModels.join(', ')}`);
            } else {
                console.debug(`[Router] Gemini cooling down. Using general fallback for search.`);
            }
        }

        (context as any).providersAttempted = [];
        const startTime = Date.now();
        const totalBudget = context.request.timeoutMs || 60000;

        const getRemainingTimeout = () => {
            const elapsed = Date.now() - startTime;
            return Math.max(0, totalBudget - elapsed);
        };

        const compressionResult = await this.promptCompressor.compressIfNeeded(
            context,
            availableProviders,
            TextRouterMiddleware.taskRouteMap,
            getRemainingTimeout,
            totalBudget
        );

        let estimatedTokens = compressionResult.estimatedTokens;
        let contextCompressed = compressionResult.contextCompressed;
        if (contextCompressed) {
            (context as any).contextCompressed = true;
        }

        const isHeavyPrompt = (context.estimatedTokens || estimatedTokens) > 8000;

        const rawLastMsg = context.request.messages.length > 0
            ? getMessageContent(context.request.messages[context.request.messages.length - 1])
            : '';
        const lowerPrompt = rawLastMsg.toLowerCase();
        
        const confused = isUserConfused(rawLastMsg);
        if (confused) {
            console.debug('[TextRouter] Confused user state detected (no clear prompt or only file references).');
            // Bypass wiki indexing and maintenance
            (context as any).skipIndexing = true;
            (context.request as any).skipIndexing = true;

            // Prepend system note to inform the model and ask it to guide the user
            const confusedInstruction = "\n[System Note: The user has not provided a clear request or instructions. They might be confused or just sharing/uploading. Please guide them on what they can do next with these files/images, summarize the contents briefly, and ask what they would like to do.]";
            if (context.request.messages && context.request.messages.length > 0) {
                const userMsg = context.request.messages.find(m => m.role === 'user');
                if (userMsg) {
                    if (typeof userMsg.content === 'string') {
                        userMsg.content += confusedInstruction;
                    } else if (Array.isArray(userMsg.content)) {
                        const txtItem = userMsg.content.find((item: any) => item.type === 'text');
                        if (txtItem) {
                            txtItem.text += confusedInstruction;
                        } else {
                            userMsg.content.push({ type: 'text', text: confusedInstruction.trim() });
                        }
                    }
                }
            }
        }

        const hasCodeExtensions = /\.(ts|js|py|go|rs|cpp|h|java|sh|rb|php|cs|swift|json|yml|yaml|toml)\b/i.test(lowerPrompt) ||
            (context.keywords && context.keywords.some(kw => /\.(ts|js|py|go|rs|cpp|h|java|sh|rb|php|cs|swift|json|yml|yaml|toml)\b/i.test(kw)));
        const hasCodingTerms = /\b(code|function|class|method|implement|implementation|refactor|debug|compile|build|test|git|repo|syntax|develop|program|script|rust|python|javascript|golang|cpp|c\+\+|java|ruby|php|html|css|sql)\b/i.test(lowerPrompt);
        const isCodingContext = hasCodeExtensions || hasCodingTerms || taskType === TaskType.Coding;

        const scoredCandidates = finalTierModels.map(modelId => {
            const cap = getModelCapability(modelId);
            const providersWithModel = availableProviders.filter(p => p.models.some(m => m.id === modelId));
            if (providersWithModel.length === 0) {
                return { modelId, score: -1 };
            }

            let score = cap;
            const lowerModel = modelId.toLowerCase();
            const isCoder = lowerModel.includes('coder') || lowerModel.includes('code');
            const isReasoning = lowerModel.includes('r1') || lowerModel.includes('deepseek') || lowerModel.includes('pro') || lowerModel.includes('o1') || lowerModel.includes('o3');

            if (isCodingContext) {
                if (isCoder) score += 0.5;
                else if (isReasoning) score += 0.25;
            } else if (taskType === TaskType.Reasoning) {
                if (isReasoning) score += 0.5;
            }

            return { modelId, score };
        })
        .filter(c => c.score >= 0)
        .sort((a, b) => confused ? a.score - b.score : b.score - a.score);

        finalTierModels = scoredCandidates.slice(0, 15).map(c => c.modelId);

        if (requestedModel === 'any') {
            const allAvailableModels = availableProviders.flatMap(p => p.models.map(m => m.id));
            for (const mId of allAvailableModels) {
                if (!finalTierModels.includes(mId)) {
                    finalTierModels.push(mId);
                }
            }
        }

        const quantumProbabilities = this.calculateQuantumModelProbabilities(
            finalTierModels,
            taskType,
            estimatedTokens,
            availableProviders
        );

        finalTierModels.sort((a, b) => {
            if (requestedModel && requestedModel !== 'any') {
                if (a === requestedModel) return -1;
                if (b === requestedModel) return 1;
            }
            if (context.request.google_search) {
                if (a === 'gemini-3.1-flash-lite') return -1;
                if (b === 'gemini-3.1-flash-lite') return 1;
            }
            const probA = quantumProbabilities.find(qp => qp.modelId === a)?.probability || 0;
            const probB = quantumProbabilities.find(qp => qp.modelId === b)?.probability || 0;
            return confused ? probA - probB : probB - probA;
        });

        console.error(`[Router][Quantum] Top sorted candidates by collapse probability:`);
        finalTierModels.slice(0, 3).forEach(mId => {
            const prob = quantumProbabilities.find(qp => qp.modelId === mId)?.probability || 0;
            console.error(`  |${mId}⟩: ${(prob * 100).toFixed(1)}%`);
        });

        let primaryError: Error | null = null;
        let lastError: Error | null = null;
        const allErrors: string[] = [];

        for (const modelId of finalTierModels) {
            const capability = getModelCapability(modelId);
            const scoredProviders = availableProviders
                .filter(p => p.models.some(m => m.id === modelId))
                .map(provider => {
                    return {
                        provider: provider as any,
                        score: this.calculateProviderScore(provider, modelId, capability, estimatedTokens, isHeavyPrompt, requestedModel, context)
                    };
                })
                .filter(p => p.score > -0.5)
                .sort((a, b) => b.score - a.score);

            const triedProviders = new Set<string>();
            let successfulResponse: ChatResponse | null = null;
            let successfulProviderId: string | null = null;

            for (const { provider } of scoredProviders) {
                if (triedProviders.has(provider.id)) continue;
                triedProviders.add(provider.id);

                const stats = this.executor.getProviderStats()[provider.id] as any;
                if (stats?.circuitOpen) {
                    console.error(`[Router][CircuitBreaker] Processing cooling-down provider ${provider.id} because it matched task requirements`);
                }

                const remainingTimeout = getRemainingTimeout();
                if (remainingTimeout < 2000) continue;

                const lowerModel = modelId.toLowerCase();
                const isReasoning = lowerModel.includes('deepseek') || lowerModel.includes('r1') || lowerModel.includes('o1') || lowerModel.includes('o3') || lowerModel.includes('gemini-pro') || lowerModel.includes('pro-preview');

                let perAttemptTimeout = Math.min(remainingTimeout, Math.max(12000, Math.floor(remainingTimeout / 2)));
                if (isReasoning) {
                    perAttemptTimeout = Math.min(remainingTimeout, Math.max(30000, Math.floor(remainingTimeout * 0.8)));
                }

                console.error(`[Router][Sequential] Launching ${provider.id}/${modelId} (budget: ${remainingTimeout}ms, attempt timeout: ${perAttemptTimeout}ms)`);
                (context as any).providersAttempted.push(`${provider.id}/${modelId}`);

                const attemptRequest = {
                    ...context.request,
                    model: modelId,
                };

                if (provider.id !== 'gemini') {
                    delete attemptRequest.google_search;
                }

                if (isReasoning) {
                    attemptRequest.max_tokens = Math.max(attemptRequest.max_tokens || 0, 8192);
                } else if (!attemptRequest.max_tokens) {
                    attemptRequest.max_tokens = calculateModelWeightedMaxTokens(modelId);
                }

                const precisionTasks: string[] = [TaskType.Coding, TaskType.EntityExtraction, TaskType.Classification];
                if (precisionTasks.includes(taskType)) {
                    attemptRequest.temperature = Math.min(attemptRequest.temperature ?? 0.7, 0.5);
                }

                try {
                    const tempContext = { ...context, request: attemptRequest };
                    const response = await this.executor.tryProvider(tempContext, provider.id, modelId, perAttemptTimeout);

                    if (response) {
                        successfulResponse = response;
                        successfulProviderId = provider.id;
                        if (contextCompressed) (context as any).contextCompressed = true;
                        break;
                    }
                } catch (err: any) {
                    lastError = err;
                    const errMsg = err.message?.toLowerCase() || '';
                    const isContextOverflow =
                        errMsg.includes('context_length_exceeded') ||
                        errMsg.includes('too many tokens') ||
                        errMsg.includes('string is too long') ||
                        (err.status === 400 && (errMsg.includes('context') || errMsg.includes('token') || errMsg.includes('length')));

                    if (isContextOverflow) {
                        console.error(`[Router][Overflow] Triggering dynamic compression due to error: ${err.message}`);
                        try {
                            const currentTokens = context.estimatedTokens || 4000;
                            const compResult = await this.contextManager.compress(context, currentTokens * 0.5, async (text) => text.substring(0, text.length / 2));
                            context.request.messages = compResult.messages;
                            context.estimatedTokens = this.executor.calculateTokens(context.request.messages);
                            contextCompressed = true;
                        } catch (compErr) {
                            console.error(`[Router][Overflow] Compression fallback failed: ${compErr}`);
                        }
                    }

                    if (context.providerId && provider.id === context.providerId && !primaryError) {
                        primaryError = err;
                    }
                    allErrors.push(`${provider.id}/${modelId}: ${err.message}`);
                    this.executor.recordProviderFailure(provider.id, err.status || 500);
                }
            }

            if (successfulResponse && successfulProviderId) {
                const res = successfulResponse as ChatResponse;
                if (res.choices && res.choices[0]?.message) {
                    const msg = res.choices[0].message as any;
                    const thoughts = (msg.thinking || msg.reasoning || '').toString().trim();
                    if (thoughts) {
                        prependToMessageContent(msg, `THOUGHTS: ${thoughts}\n\n`);
                        delete msg.thinking;
                        delete msg.reasoning;
                    }

                    if (typeof msg.content === 'string') {
                        msg.content = msg.content
                            .replace(/\n+(?=[{\[])/g, '')
                            .replace(/([}\]])\n+/g, '$1')
                            .trim();
                    } else if (Array.isArray(msg.content)) {
                        msg.content.forEach((p: any) => {
                            if (p.text) {
                                p.text = p.text
                                    .replace(/\n+(?=[{\[])/g, '')
                                    .replace(/([}\]])\n+/g, '$1')
                                    .trim();
                            }
                        });
                    }
                }

                context.response = res;
                context.providerId = successfulProviderId;
                context.request.model = modelId;
                return;
            }
        }

        const emergencyModels = ['google/gemma-4-31b-it','gemma-4-31b-it','gemma-4-26b-a4b-it','gemini-3.1-flash-lite', 'glm-4.7-flash', 'llama-3.3-70b-versatile'];
        const emergencyTruncation = this.contextManager.truncateOldest(context.request.messages, 8000);
        context.request.messages = emergencyTruncation.messages;
        delete context.estimatedTokens;

        for (const modelId of emergencyModels) {
            const providers = availableProviders.filter(p => p.models.some(m => m.id === modelId));
            for (const p of providers) {
                try {
                    (context as any).providersAttempted.push(`EMERGENCY:${p.id}/${modelId}`);
                    context.request.model = modelId;
                    const res = await this.executor.tryProvider(context, p.id, modelId);
                    if (res) {
                        (context as any).contextCompressed = true;
                        if (res.choices && res.choices[0]?.message) {
                            const msg = res.choices[0].message as any;
                            const thoughts = (msg.thinking || msg.reasoning || '').toString().trim();
                            if (thoughts) {
                                prependToMessageContent(msg, `THOUGHTS: ${thoughts}\n\n`);
                                delete msg.thinking;
                                delete msg.reasoning;
                            }
                            if (typeof msg.content === 'string') {
                                msg.content = msg.content
                                    .replace(/\n+(?=[{\[])/g, '')
                                    .replace(/([}\]])\n+/g, '$1')
                                    .trim();
                            }
                        }
                        context.response = res ?? undefined;
                        context.providerId = p.id;
                        return;
                    }
                } catch (err: any) {
                    allErrors.push(`EMERGENCY:${p.id}/${modelId}: ${err.message}`);
                    p.recordFailure(err.status || 500);
                }
            }
        }

        const mainError = primaryError || lastError;
        const errorSummary = allErrors.slice(-3).join('; ');
        throw new Error(this.renderRouterError(taskType, context, mainError, errorSummary));
    }

    private calculateQuantumModelProbabilities(
        models: string[],
        taskType: TaskType,
        estimatedTokens: number,
        availableProviders: any[]
    ): Array<{ modelId: string; probability: number }> {
        const amplitudes = models.map(modelId => {
            const cap = getModelCapability(modelId);
            const isCoder = isCoderModel(modelId);
            const isReasoning = isReasoningModel(modelId);

            let alignment = 1.0;
            if (taskType !== TaskType.Vision && isVisionOnlyModel(modelId)) {
                alignment = 0.01;
            } else {
                switch (taskType) {
                    case TaskType.Coding:
                        alignment = isCoder ? cap * 2.0 : (isReasoning ? cap * 1.5 : cap * 0.8);
                        break;
                    case TaskType.Reasoning:
                        alignment = isReasoning ? cap * 2.5 : cap * 0.6;
                        break;
                    case TaskType.Vision:
                        alignment = isVisionOnlyModel(modelId) ? cap * 2.0 : cap * 1.0;
                        break;
                    case TaskType.Summarization:
                        alignment = cap * 1.2;
                        break;
                    default:
                        alignment = cap;
                        break;
                }
            }

            const providersWithModel = availableProviders.filter(p => p.models.some((m: any) => m.id === modelId));
            const activeCount = providersWithModel.filter(p => !this.executor.getProviderStats()[p.id]?.circuitOpen).length;
            const healthFactor = providersWithModel.length > 0 ? (activeCount / providersWithModel.length) : 0.1;

            const maxContextWindow = Math.max(...providersWithModel.map(p => {
                const m = p.models.find((model: any) => model.id === modelId);
                return m?.contextWindow || getModelContextLimit(modelId);
            }), 32000);

            let capacityFactor = 1.0;
            if (estimatedTokens > maxContextWindow * 0.9) {
                capacityFactor = 0.1;
            } else if (estimatedTokens > maxContextWindow * 0.7) {
                capacityFactor = 0.5;
            }

            return {
                modelId,
                amplitude: alignment * healthFactor * capacityFactor
            };
        });

        const totalAmplitude = amplitudes.reduce((sum, item) => sum + item.amplitude, 0);
        if (totalAmplitude <= 0) {
            return models.map(modelId => ({ modelId, probability: 1.0 / models.length }));
        }

        return amplitudes.map(item => ({
            modelId: item.modelId,
            probability: item.amplitude / totalAmplitude
        }));
    }

    private calculateProviderScore(
        provider: any,
        modelId: string,
        capability: number,
        estimatedTokens: number,
        isHeavyPrompt: boolean,
        requestedModel: string | undefined,
        context: PipelineContext
    ): number {
        const stats = this.executor.getProviderStats()[provider.id] as any;
        const now = Date.now();

        let baseScore = capability;

        const model = provider.models.find((m: any) => m.id === modelId);
        const maxContextWindow = model?.contextWindow || getModelContextLimit(modelId);

        if (estimatedTokens > maxContextWindow) {
            return -1;
        }

        let healthScore = 1.0;
        if (stats) {
            if (stats.circuitOpen) {
                healthScore = 0.1;
            } else if (stats.consecutiveFailures > 0) {
                healthScore = Math.max(0.2, 1.0 - (stats.consecutiveFailures * 0.25));
            }
        }

        const tokenState = this.executor.getTokenState()[provider.id];
        let tokenFactor = 1.0;
        if (tokenState && tokenState.remainingTokens !== undefined) {
            if (tokenState.remainingTokens <= 2000) {
                tokenFactor = 0.1; // extreme throttle
            } else if (tokenState.remainingTokens <= 10000) {
                tokenFactor = 0.5; // soft throttle
            }
        }

        let scoreModifier = 1.0;
        const lowCostProviders = ['gemini', 'cloudflare', 'github-models', 'huggingface'];
        if (lowCostProviders.includes(provider.id)) {
            scoreModifier = 1.3;
        }

        if (provider.id === 'huggingface') {
            scoreModifier *= 0.7;
        }

        const lastSuccess = stats?.lastSuccessTime || 0;
        const recencyBonus = (now - lastSuccess) < 300000 ? 1.2 : 1.0;

        let modelBonus = 0;
        if (requestedModel && modelId === requestedModel) {
            modelBonus = 0.3;
        }

        const penalty = typeof provider.getPenaltyScore === 'function' ? provider.getPenaltyScore() : 0;
        let finalScore = (baseScore * healthScore * tokenFactor * scoreModifier * recencyBonus) - penalty + modelBonus;

        if (!Number.isFinite(finalScore)) {
            return -1;
        }

        return finalScore;
    }

    private renderRouterError(taskType: string, context: PipelineContext, mainError: Error | null, errorSummary: string): string {
        const primary = context.providerId || 'auto';
        const failMessage = mainError?.message || 'No available providers';
        const attempts = (context as any).providersAttempted?.join(', ') || 'none';

        return `[Router] Exhausted all fallback models for task ${taskType}. ` +
            `Primary provider ${primary} failed: ${failMessage}. ` +
            `Attempts: ${attempts}. ` +
            `Recent errors: ${errorSummary}`;
    }
}
