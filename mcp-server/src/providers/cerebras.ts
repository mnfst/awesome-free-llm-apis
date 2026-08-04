import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class CerebrasProvider extends BaseProvider {
  name = 'Cerebras';
  id = 'cerebras';
  baseURL = 'https://api.cerebras.ai/v1/';
  envVar = 'CEREBRAS_API_KEY';
  rateLimits: RateLimits = { rpm: 30, rpd: 14400 };
  models: ProviderModel[] = [
    { id: 'zai-glm-4.7', name: 'Zai GLM 4.7' },
    { id: 'gpt-oss-120b', name: 'GPT OSS 120B' },
    { id: 'gemma-4-31b', name: 'Gemma 4 31B' },
  ];
}
