/**
 * @file _changed-models.ts
 * @description Model IDs added/removed per provider by the 2026-08-21 upstream
 * data.json merge (167013f). Used by the provider smoke-test scripts to verify
 * both the newly added models and confirm whether removed models are truly dead.
 * Gemini is excluded per user instruction.
 * Cerebras and GitHub Models are fully deprecated.
 */

export interface ChangedModels {
  added: string[];
  removed: string[];
}

export const CHANGED_MODELS: Record<string, ChangedModels> = {
  // cerebras entry removed as of v1.1.0 — provider fully deprecated (free tier replaced by mandatory payment method)
  // github-models entry removed as of v1.0.9 — provider fully deprecated (see src/providers/github-models.ts)
  cohere: {
    added: [],
    removed: [],
  },
  groq: {
    added: [],
    removed: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  huggingface: {
    added: [],
    removed: [],
  },
  kilocode: {
    added: [
      'tencent/hy3:free',
      'nvidia/nemotron-3.5-lightning:free',
      'liquid/lfm-2.5-2.6b:free',
    ],
    removed: [
      'inclusionai/ling-3.0-flash:free',
    ],
  },
  mistral: {
    added: [
      'mistral-medium-3-5',
    ],
    removed: [
      'mistral-medium-2604',
    ],
  },
  nvidia: {
    added: [],
    removed: [
      'deepseek-ai/deepseek-v4-flash',
      'mistralai/mistral-medium-3.5-128b',
      'deepseek-ai/deepseek-v4-pro',
    ],
  },
  'ollama-cloud': {
    added: [],
    removed: [],
  },
  openrouter: {
    added: [
      'nvidia/nemotron-3.5-content-safety:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free',
      'openai/gpt-oss-20b:free',
    ],
    removed: [
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-nano-12b-v2-vl:free',
      'nvidia/nemotron-nano-9b-v2:free',
    ],
  },
  llm7: {
    added: [
      'gpt-oss:20b',
      'mistral-Nemo-Instruct-2407',
      'minimax-m2.7',
    ],
    removed: [
      'deepseek-r1-0528',
      'deepseek-v3-0324',
      'gemini-2.5-flash-lite',
      'gpt-4o-mini',
      'mistral-small-3.1-24b',
      'qwen2.5-coder-32b',
    ],
  },
  siliconflow: {
    added: [],
    removed: [
      'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    ],
  },
  cloudflare: {
    added: [
      '@cf/zai-org/glm-4.7-flash',
    ],
    removed: [
      '@cf/moonshotai/kimi-k2.7-code',
      '@cf/zhipuai/glm-4.7-flash',
    ],
  },
  zhipu: {
    added: [],
    removed: [],
  },
};
