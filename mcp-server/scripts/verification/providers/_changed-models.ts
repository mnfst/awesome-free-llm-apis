/**
 * @file _changed-models.ts
 * @description Model IDs added/removed per provider by the 2026-07-30 upstream
 * data.json merge (bd49ba2). Used by the provider smoke-test scripts to verify
 * both the newly added models and confirm whether removed models are truly dead.
 * Aion Labs is intentionally excluded (no changes worth testing there).
 */

export interface ChangedModels {
  added: string[];
  removed: string[];
}

export const CHANGED_MODELS: Record<string, ChangedModels> = {
  cerebras: {
    added: ['gemma-4-31b'],
    removed: [],
  },
  cohere: {
    added: [
      'c4ai-aya-expanse-32b',
      'c4ai-aya-vision-32b',
      'command-a-reasoning-08-2025',
      'command-a-translate-08-2025',
      'command-a-vision-07-2025',
      'command-r7b-arabic-02-2025',
    ],
    removed: [],
  },
  // github-models entry removed as of v1.0.9 — provider fully deprecated (see src/providers/github-models.ts)
  gemini: {
    added: ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'],
    removed: [],
  },
  groq: {
    added: [
      'groq/compound',
      'groq/compound-mini',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.6-27b',
    ],
    removed: ['gpt-oss-120b', 'llama-4-scout-17b-16e-instruct', 'qwen3-32b'],
  },
  huggingface: {
    added: [
      'Qwen/Qwen2.5-Coder-7B-Instruct',
      'google/gemma-3-4b-it',
      'meta-llama/Llama-3.1-8B-Instruct',
      'microsoft/phi-4',
    ],
    removed: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct',
      'microsoft/Phi-3.5-mini-instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
  },
  kilocode: {
    added: [
      'cohere/north-mini-code:free',
      'inclusionai/ling-3.0-flash:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'poolside/laguna-s-2.1:free',
      'poolside/laguna-xs-2.1:free',
      'stepfun/step-3.7-flash:free',
    ],
    removed: [
      'arcee-ai/trinity-large-thinking:free',
      'bytedance-seed/dola-seed-2.0-pro:free',
      'minimax/minimax-m2.5:free',
      'x-ai/grok-code-fast-1:free',
    ],
  },
  mistral: {
    added: [
      'codestral-2508',
      'ministral-14b-2512',
      'ministral-3b-2512',
      'ministral-8b-2512',
      'mistral-large-2512',
    ],
    removed: ['codestral-2501', 'mistral-large-2411', 'open-mistral-nemo', 'pixtral-large-2411'],
  },
  nvidia: {
    added: [
      'deepseek-ai/deepseek-v4-flash',
      'deepseek-ai/deepseek-v4-pro',
      'google/gemma-4-31b-it',
      'meta/llama-3.3-70b-instruct',
      'minimaxai/minimax-m3',
      'mistralai/mistral-medium-3.5-128b',
      'mistralai/mistral-nemotron',
      'nvidia/nemotron-3-ultra-550b-a55b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ],
    removed: [
      'deepseek-ai/deepseek-r1',
      'google/gemma-4-31b',
      'meta/llama-3.1-405b-instruct',
      'minimax/minimax-m2.7',
      'qwen/qwen2.5-72b-instruct',
    ],
  },
  'ollama-cloud': {
    added: [
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'gpt-oss:120b',
      'gpt-oss:20b',
      'kimi-k3',
      'minimax-m3',
      'mistral-large-3:675b',
      'nemotron-3-ultra',
      'qwen3.5:397b',
    ],
    removed: [
      'deepseek-r1:cloud',
      'deepseek-v3.1:671b-cloud',
      'glm-4.6:cloud',
      'gpt-oss:120b-cloud',
      'kimi-k2:1t-cloud',
      'qwen3-coder:480b-cloud',
    ],
  },
  openrouter: {
    added: [
      'cohere/north-mini-code:free',
      'google/gemma-4-26b-a4b-it:free',
      'inclusionai/ling-3.0-flash:free',
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-nano-12b-v2-vl:free',
      'nvidia/nemotron-nano-9b-v2:free',
      'poolside/laguna-s-2.1:free',
      'poolside/laguna-xs-2.1:free',
    ],
    removed: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'nousresearch/hermes-3-llama-3.1-405b:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'openai/gpt-oss-120b:free',
      'poolside/laguna-m.1:free',
      'qwen/qwen3-coder:free',
      'qwen/qwen3-next-80b-a3b-instruct:free',
    ],
  },
  zhipu: {
    added: ['glm-4.5-flash'],
    removed: [],
  },
};
