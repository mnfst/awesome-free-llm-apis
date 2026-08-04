import { BaseProvider } from './base.js';
import type { ChatRequest, ChatResponse, ProviderModel, RateLimits } from './types.js';

/**
 * @deprecated as of v1.0.9 — GitHub Models retired/unreliable (persistent
 * "scheduled retirement brownout" outages); no longer registered in
 * ProviderRegistry. Kept here for reference only.
 */
export class GitHubModelsProvider extends BaseProvider {
  name = 'GitHub Models';
  id = 'github-models';
  baseURL = 'https://models.github.ai/inference/';
  envVar = 'GITHUB_TOKEN';
  rateLimits: RateLimits = { rpm: 15, rpd: 150 };
  models: ProviderModel[] = [
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
    { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },

    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' },

    { id: 'deepseek/deepseek-v3-0324', name: 'DeepSeek V3' },

    { id: 'meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout' },
    { id: 'meta/llama-4-maverick-17b-128e-instruct-fp8', name: 'Llama 4 Maverick' },

    { id: 'microsoft/phi-4-mini-reasoning', name: 'Phi-4 Mini Reasoning' },

    { id: 'mistral-ai/codestral-2501', name: 'Codestral 25.01' },
    { id: 'mistral-ai/mistral-small-2503', name: 'Mistral Small 3.1' },

    { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision' },
    { id: 'meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision' },
    { id: 'microsoft/phi-4-multimodal-instruct', name: 'Phi-4 Multimodal (Vision)' }
  ];

  private transformRequest(request: ChatRequest): any {
    const updatedRequest = { ...request } as any;
    const model = updatedRequest.model || '';
    if ('max_tokens' in updatedRequest && (model.includes('gpt-5') || model.includes('o1') || model.includes('o3'))) {
      updatedRequest.max_completion_tokens = updatedRequest.max_tokens;
      delete updatedRequest.max_tokens;
    }
    return updatedRequest;
  }

  override async chat(request: ChatRequest): Promise<ChatResponse> {
    return super.chat(this.transformRequest(request));
  }

  override async *chatStream(request: ChatRequest): AsyncIterable<string> {
    yield* super.chatStream(this.transformRequest(request));
  }
}

