import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class LLM7Provider extends BaseProvider {
  name = 'LLM7.io';
  id = 'llm7';
  baseURL = 'https://api.llm7.io/v1/';
  envVar = 'LLM7_API_KEY';
  rateLimits: RateLimits = { rpm: 30 };
  models: ProviderModel[] = [
    { id: 'gpt-oss:20b', name: 'GPT-OSS 20B' },
    { id: 'kimi-k2.6', name: 'Kimi K2.6' },
    { id: 'codestral-latest', name: 'Codestral Latest' },
    { id: 'minimax-m2.7', name: 'MiniMax M2.7' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini (Vision)' },
  ];
}
