import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class HuggingFaceProvider extends BaseProvider {
  name = 'Hugging Face';
  id = 'huggingface';
  baseURL = 'https://router.huggingface.co/v1/';
  envVar = 'HF_TOKEN';
  // v1.0.6: Hugging Face is no longer treated as unlimited-free in routing.
  // Track as credit-based ($0.10 monthly credits) so routers can deprioritize it.
  rateLimits: RateLimits = { reqPerMonth: 1 };
  models: ProviderModel[] = [
    { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct' },
    { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B' },
    { id: 'google/gemma-4-31B-it', name: 'Gemma 4 31B' },
    { id: 'google/gemma-4-26B-A4B-it', name: 'Gemma 4 26B' },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
    { id: 'Qwen/Qwen2.5-Coder-7B-Instruct', name: 'Qwen2.5 Coder 7B Instruct' },
    { id: 'google/gemma-3-4b-it', name: 'Gemma 3 4B' },
    { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct' },
    { id: 'microsoft/phi-4', name: 'Phi-4' },
    { id: 'empero-ai/Qwythos-9B-Claude-Mythos-5-1M', name: 'Qwythos 9B Claude Mythos 5.1M' },
  ];
}
