import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class OpenRouterProvider extends BaseProvider {
  name = 'OpenRouter';
  id = 'openrouter';
  baseURL = 'https://openrouter.ai/api/v1/';
  envVar = 'OPENROUTER_API_KEY';
  rateLimits: RateLimits = { rpm: 20, rpd: 50 };
  models: ProviderModel[] = [
    { id: 'openrouter/free', name: 'OpenRouter Free Router' },
    { id: 'nvidia/nemotron-mini-4b-instruct:free', name: 'Nemotron Mini 4B Instruct' },
    { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large Preview' },
    { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air' },
    { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini' },
    //{ id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B' },
    { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B' },
    { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B' },
    { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B' },
    { id: 'mistralai/mistral-small-3.1-24b:free', name: 'Mistral Small 3.1 24B' },
    { id: 'liquid/lfm2.5-1.2b-thinking:free', name: 'LFM 2.5 1.2B Thinking' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B' },
    { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B VL' },
    { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B' },
    { id: 'qwen/qwen3-coder-480b-a35b:free', name: 'Qwen 3 Coder 480B' },
    { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (Vision)' },
    { id: 'meta-llama/llama-4-scout:free', name: 'Llama 4 Scout (Vision)' },
    { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1' },
  ];
}
