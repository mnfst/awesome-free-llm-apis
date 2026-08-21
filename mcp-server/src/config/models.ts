export interface ModelMetadata {
    capability: number;      // 0.0 to 1.0
    contextWindow: number;   // context window size in tokens
    isVision?: boolean;      // supports multimodal/image input
    isVisionOnly?: boolean;  // strictly for vision/multimodal, cannot handle general text tasks
    isCoder?: boolean;       // specialized for coding
    isReasoning?: boolean;   // specialized for reasoning (thinking)
}

export const MODEL_METADATA: Record<string, ModelMetadata> = {
    // Frontier Reasoning
    'deepseek-ai/DeepSeek-R1': { capability: 1.0, contextWindow: 64000, isReasoning: true },
    'liquid/lfm2.5-1.2b-thinking:free': { capability: 0.88, contextWindow: 32000, isReasoning: true },
    'microsoft/phi-4': { capability: 0.86, contextWindow: 128000, isReasoning: true },
    'empero-ai/Qwythos-9B-Claude-Mythos-5-1M': { capability: 0.95, contextWindow: 128000 },

    // S-Tier Generalists
    'gemma-4-31b-it': { capability: 0.95, contextWindow: 300000, isVision: true, isReasoning: true },
    'google/gemma-4-31B-it': { capability: 0.95, contextWindow: 300000, isVision: true },
    'google/gemma-4-31b-it:free': { capability: 0.95, contextWindow: 300000, isVision: true },
    'gemma-4-26b-a4b-it': { capability: 0.94, contextWindow: 150000, isVision: true },
    'google/gemma-4-26B-A4B-it': { capability: 0.94, contextWindow: 150000, isVision: true },
    'google/gemma-4-26b-a4b-it:free': { capability: 0.94, contextWindow: 150000, isVision: true },
    'openai/gpt-oss-120b': { capability: 0.94, contextWindow: 128000 },
    'gpt-oss:120b': { capability: 0.94, contextWindow: 128000 },
    'deepseek-ai/DeepSeek-V3': { capability: 0.92, contextWindow: 128000 },
    'command-r-plus-08-2024': { capability: 0.90, contextWindow: 128000 },
    'command-a-03-2025': { capability: 0.88, contextWindow: 128000 },
    'command-a-plus-05-2026': { capability: 0.92, contextWindow: 128000, isVision: true },
    'command-a-reasoning-08-2025': { capability: 0.90, contextWindow: 128000, isReasoning: true },
    'c4ai-aya-vision-32b': { capability: 0.88, contextWindow: 128000, isVision: true },
    'command-a-vision-07-2025': { capability: 0.88, contextWindow: 128000, isVision: true },
    'c4ai-aya-expanse-32b': { capability: 0.80, contextWindow: 128000 },
    'command-r7b-12-2024': { capability: 0.80, contextWindow: 128000 },
    'gemma4:31b': { capability: 0.90, contextWindow: 300000 },

    // Coder Models
    'qwen/qwen3-coder-480b-a35b:free': { capability: 0.96, contextWindow: 128000, isCoder: true },
    'Qwen/Qwen2.5-Coder-7B-Instruct': { capability: 0.78, contextWindow: 32000, isCoder: true },
    'Qwen/Qwen3-Coder-30B-A3B-Instruct': { capability: 0.88, contextWindow: 128000, isCoder: true },
    'openai/gpt-oss-20b': { capability: 0.75, contextWindow: 32000 },
    'openai/gpt-oss-20b:free': { capability: 0.75, contextWindow: 32000 },
    'gpt-oss:20b': { capability: 0.78, contextWindow: 32000 },
    'groq/compound': { capability: 0.88, contextWindow: 128000 },
    'groq/compound-mini': { capability: 0.84, contextWindow: 128000 },
    'codestral-latest': { capability: 0.88, contextWindow: 128000, isCoder: true },
    'poolside/laguna-s-2.1:free': { capability: 0.82, contextWindow: 128000, isCoder: true },
    'kilo-auto/free': { capability: 0.85, contextWindow: 128000, isCoder: true },

    // A-Tier & Multimodal Models
    'qwen/qwen3.6-27b': { capability: 0.88, contextWindow: 131072, isVision: true },
    'mistralai/mistral-nemotron': { capability: 0.88, contextWindow: 128000 },
    'open-mistral-nemo': { capability: 0.88, contextWindow: 400000 },
    'google/gemma-3-27b-it': { capability: 0.88, contextWindow: 130000, isVision: true },
    'meta-llama/Llama-3.3-70B-Instruct': { capability: 0.85, contextWindow: 128000 },
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { capability: 0.85, contextWindow: 128000 },
    '@cf/meta/llama-4-scout-17b-16e-instruct': { capability: 0.90, contextWindow: 128000, isVision: true },
    '@cf/google/gemma-4-26b-a4b-it': { capability: 0.94, contextWindow: 128000, isVision: true },
    '@cf/google/gemma-3-12b-it': { capability: 0.82, contextWindow: 128000, isVision: true },
    '@cf/moonshotai/kimi-k2.6': { capability: 0.88, contextWindow: 128000, isVision: true },
    '@cf/mistralai/mistral-small-3.1-24b-instruct': { capability: 0.84, contextWindow: 128000, isVision: true },
    '@cf/qwen/qwen2.5-coder-32b-instruct': { capability: 0.88, contextWindow: 128000, isCoder: true },
    '@cf/qwen/qwq-32b': { capability: 0.88, contextWindow: 128000, isReasoning: true },
    '@cf/meta/llama-3.2-11b-vision-instruct': { capability: 0.80, contextWindow: 128000, isVision: true },
    'mistral-large-latest': { capability: 0.85, contextWindow: 128000 },
    'mistral-medium-latest': { capability: 0.84, contextWindow: 20000 },
    'mistral-small-latest': { capability: 0.82, contextWindow: 128000 },
    'ministral-8b-latest': { capability: 0.82, contextWindow: 128000 },
    'mistralai/mistral-small-3.1-24b:free': { capability: 0.82, contextWindow: 128000 },
    'Qwen/Qwen2.5-72B-Instruct': { capability: 0.85, contextWindow: 128000 },
    'Qwen/Qwen2.5-7B-Instruct': { capability: 0.80, contextWindow: 32000 },
    'Qwen/Qwen3-8B': { capability: 0.70, contextWindow: 32000 },
    'gemini-3.1-flash-lite': { capability: 0.82, contextWindow: 150000, isVision: true },
    'meta-llama/llama-4-maverick:free': { capability: 0.88, contextWindow: 128000, isVision: true },
    'meta-llama/llama-4-scout:free': { capability: 0.88, contextWindow: 128000, isVision: true },
    'meta-llama/Llama-3.1-8B-Instruct': { capability: 0.75, contextWindow: 128000 },
    'meta/llama-3.1-8b-instruct': { capability: 0.75, contextWindow: 128000 },
    'google/gemma-3-4b-it': { capability: 0.72, contextWindow: 130000, isVision: true },
    'arcee-ai/trinity-large-preview:free': { capability: 0.85, contextWindow: 128000 },
    'arcee-ai/trinity-mini:free': { capability: 0.75, contextWindow: 128000 },
    'openrouter/free': { capability: 0.80, contextWindow: 128000 },
    'z-ai/glm-4.5-air:free': { capability: 0.75, contextWindow: 128000 },
    'stepfun/step-3.7-flash:free': { capability: 0.84, contextWindow: 128000, isVision: true },
    'glm-4.5-flash': { capability: 0.80, contextWindow: 128000 },
    'glm-4.7-flash': { capability: 0.85, contextWindow: 128000 },
    'glm-4.6V-flash': { capability: 0.82, contextWindow: 128000, isVision: true },

    // ModelScope / Zhipu flagship
    'zai-org/GLM-5.2': { capability: 0.98, contextWindow: 128000 },
    'zai-org/GLM-5.1': { capability: 0.96, contextWindow: 128000 },
    'zai-org/GLM-5': { capability: 0.94, contextWindow: 128000 },
    'zai-org/GLM-4.7-Flash': { capability: 0.85, contextWindow: 128000 },
    'deepseek-ai/DeepSeek-V4-Pro': { capability: 0.98, contextWindow: 128000, isReasoning: true },
    'deepseek-ai/DeepSeek-V4-Flash': { capability: 0.88, contextWindow: 128000 },
    'deepseek-ai/DeepSeek-V3.2': { capability: 0.94, contextWindow: 128000 },
    'Qwen/Qwen3.5-397B-A17B': { capability: 0.96, contextWindow: 128000, isVision: true },
    'Qwen/Qwen3-VL-235B-A22B-Instruct': { capability: 0.92, contextWindow: 128000, isVision: true },
    'stepfun-ai/Step-3.5-Flash': { capability: 0.82, contextWindow: 128000, isVision: true },

    // Ollama Cloud active models
    'nemotron-3-ultra': { capability: 0.90, contextWindow: 128000 },
    'nemotron-3-super': { capability: 0.88, contextWindow: 128000 },
    'nemotron-3-nano:30b': { capability: 0.80, contextWindow: 32000 },
    'minimax-m3': { capability: 0.90, contextWindow: 128000 },

    // NVIDIA NIM active & free models
    'nvidia/nemotron-3.5-lightning-30b-a3b': { capability: 0.92, contextWindow: 128000, isCoder: true, isReasoning: true },
    'nvidia/nemotron-3.5-lightning:free': { capability: 0.92, contextWindow: 128000, isCoder: true, isReasoning: true },
    'meta/muse-glimmer-30b': { capability: 0.92, contextWindow: 128000, isVision: true, isReasoning: true },
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': { capability: 0.90, contextWindow: 128000, isVision: true, isReasoning: true },
    'nvidia/nemotron-3-nano-30b-a3b': { capability: 0.82, contextWindow: 128000 },
    'nvidia/nemotron-3-super-120b-a12b:free': { capability: 0.88, contextWindow: 128000, isReasoning: true },
    'nvidia/nemotron-3-ultra-550b-a55b': { capability: 0.88, contextWindow: 300000, isReasoning: true },
    'nvidia/nemotron-3-ultra-550b-a55b:free': { capability: 0.88, contextWindow: 300000, isReasoning: true },
    'nvidia/llama-3.3-nemotron-super-49b-v1': { capability: 0.90, contextWindow: 128000 },
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1': { capability: 0.82, contextWindow: 128000, isVision: true },
    'nvidia/nemotron-nano-12b-v2-vl': { capability: 0.85, contextWindow: 128000, isVision: true },
    'nvidia/nemotron-mini-4b-instruct': { capability: 0.65, contextWindow: 32000 },
    'nvidia/nemotron-mini-4b-instruct:free': { capability: 0.65, contextWindow: 32000 },
    'meta/llama-3.2-11b-vision-instruct': { capability: 0.80, contextWindow: 128000, isVision: true },
    'meta/llama-3.2-90b-vision-instruct': { capability: 0.86, contextWindow: 128000, isVision: true },
    'minimaxai/minimax-m3': { capability: 0.90, contextWindow: 128000, isVision: true },
    'google/diffusiongemma-26b-a4b-it': { capability: 0.88, contextWindow: 128000, isReasoning: true },
    'deepseek-ai/deepseek-v4-flash-0731': { capability: 0.90, contextWindow: 128000, isCoder: true },
    'z-ai/glm-5.2': { capability: 0.96, contextWindow: 128000, isReasoning: true, isCoder: true },
    'moonshotai/kimi-k3': { capability: 0.92, contextWindow: 128000, isReasoning: true },
    'meta/llama-3.1-8b-instruct': { capability: 0.75, contextWindow: 128000 },
    'tencent/hy3:free': { capability: 0.88, contextWindow: 128000, isReasoning: true },
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': { capability: 0.90, contextWindow: 256000, isVision: true, isReasoning: true },
    'minimax-m2.7': { capability: 0.85, contextWindow: 128000 },
    'groq/compound-mini': { capability: 0.84, contextWindow: 128000 },
};

/**
 * Get the capability score of a model, falling back to 0.5 if unknown
 */
export function getModelCapability(modelId: string): number {
    return MODEL_METADATA[modelId]?.capability ?? 0.5;
}

/**
 * Get the context window size of a model, falling back to 32000 if unknown
 */
export function getModelContextLimit(modelId: string): number {
    return MODEL_METADATA[modelId]?.contextWindow ?? 32000;
}

/**
 * Check if a model is a specialized reasoning model
 */
export function isReasoningModel(modelId: string): boolean {
    return !!MODEL_METADATA[modelId]?.isReasoning;
}

/**
 * Check if a model is a specialized coder model
 */
export function isCoderModel(modelId: string): boolean {
    return !!MODEL_METADATA[modelId]?.isCoder;
}

/**
 * Check if a model supports vision/multimodal input
 */
export function isVisionSupported(modelId: string): boolean {
    const meta = MODEL_METADATA[modelId];
    if (meta?.isVision !== undefined) {
        return meta.isVision;
    }
    if (meta?.isVisionOnly) {
        return true;
    }
    return false;
}

/**
 * Check if a model is strictly vision/multimodal only and cannot handle general text tasks
 */
export function isVisionOnlyModel(modelId: string): boolean {
    return !!MODEL_METADATA[modelId]?.isVisionOnly;
}

