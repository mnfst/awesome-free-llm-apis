import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class NvidiaProvider extends BaseProvider {
  name = 'NVIDIA NIM';
  id = 'nvidia';
  baseURL = 'https://integrate.api.nvidia.com/v1/';
  envVar = 'NVIDIA_API_KEY';
  rateLimits: RateLimits = { rpm: 40 };
  models: ProviderModel[] = [
    { id: 'google/gemma-3n-e2b-it', name: 'Gemma 3N E2B' },
    { id: 'meta/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B' },
    { id: 'minimaxai/minimax-m2.7', name: 'MiniMax M2.7' },
    { id: 'stepfun-ai/step-3.5-flash', name: 'Step 3.5 Flash' },
    { id: 'stepfun-ai/step-3.7-flash', name: 'Step 3.7 Flash' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra 550B' },
    { id: 'mistralai/mistral-nemotron', name: 'Mistral Nemotron' },
    { id: 'qwen/qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B' },
    { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3' },
    { id: 'google/gemma-3n-e4b-it', name: 'Gemma 3N E4B' },
    { id: 'nvidia/nemotron-mini-4b-instruct', name: 'Nemotron Mini 4B' },
    { id: 'bytedance/seed-oss-36b-instruct', name: 'Seed OSS 36B' },
    { id: 'microsoft/phi-4-multimodal-instruct', name: 'Phi-4 Multimodal' },
    { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision' },
    { id: 'meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision' },
    { id: 'google/paligemma', name: 'PaliGemma (Vision)' },
    { id: 'minimaxai/minimax-m3', name: 'MiniMax M3' },
    { id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  ];
}
