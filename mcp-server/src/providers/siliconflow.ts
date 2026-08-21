import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class SiliconFlowProvider extends BaseProvider {
    name = 'SiliconFlow';
    id = 'siliconflow';
    baseURL = 'https://api.siliconflow.cn/v1/';
    envVar = 'SILICONFLOW_API_KEY';
    rateLimits: RateLimits = { rpm: 1000 };
    models: ProviderModel[] = [
        { id: 'Qwen/Qwen3-8B', name: 'Qwen 3 8B' },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct' },
        { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B Instruct' },
        { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
    ];
}
