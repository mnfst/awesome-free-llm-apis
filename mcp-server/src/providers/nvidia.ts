import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class NvidiaProvider extends BaseProvider {
  name = 'NVIDIA NIM';
  id = 'nvidia';
  baseURL = 'https://integrate.api.nvidia.com/v1/';
  envVar = 'NVIDIA_API_KEY';
  rateLimits: RateLimits = { rpm: 40 };
  models: ProviderModel[] = [
    // Free Endpoint Models (Catalog & Screenshots)
    { id: 'deepseek-ai/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash 0731' },
    { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning 30B' },
    { id: 'meta/muse-glimmer-30b', name: 'Muse Glimmer 30B (Vision/Reasoning)' },
    { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
    { id: 'minimaxai/minimax-m3', name: 'MiniMax M3 (Vision)' },
    { id: 'google/diffusiongemma-26b-a4b-it', name: 'DiffusionGemma 26B' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra 550B' },
    { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', name: 'Nemotron 3 Nano Omni (Vision/Audio)' },
    { id: 'nvidia/nemotron-3-nano-30b-a3b', name: 'Nemotron 3 Nano 30B' },
    { id: 'nvidia/nemotron-mini-4b-instruct', name: 'Nemotron Mini 4B' },
    { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', name: 'Nemotron Super 49B' },
    { id: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1', name: 'Nemotron Nano VL 8B (Vision)' },
    { id: 'nvidia/nemotron-nano-12b-v2-vl', name: 'Nemotron Nano 12B V2 VL (Vision)' },
    { id: 'meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision' },
    { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision' },
    { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct' },
    { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
    { id: 'mistralai/mistral-nemotron', name: 'Mistral Nemotron' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
  ];
}
