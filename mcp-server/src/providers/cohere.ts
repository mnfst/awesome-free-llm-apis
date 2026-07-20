import { CohereClientV2 } from 'cohere-ai';
import { BaseProvider } from './base.js';
import type { ChatRequest, ChatResponse, ProviderModel, RateLimits } from './types.js';

export class CohereProvider extends BaseProvider {
  name = 'Cohere';
  id = 'cohere';
  baseURL = 'https://api.cohere.com/v2/';
  envVar = 'CO_API_KEY';
  rateLimits: RateLimits = { rpm: 20, reqPerMonth: 1000 };
  models: ProviderModel[] = [
    { id: 'command-a-03-2025', name: 'Command A 03 2025' },
    { id: 'command-r-plus-08-2024', name: 'Command R+ 08 2024' },
    { id: 'c4ai-aya-expanse-32b', name: 'Aya Expanse 32B' },
    { id: 'command-a-plus-05-2026', name: 'Command A+ 05 2026' },
    { id: 'command-r7b-12-2024', name: 'Command R7B' },
    { id: 'command-a-reasoning-08-2025', name: 'Command A Reasoning' },
    { id: 'c4ai-aya-vision-32b', name: 'Aya Vision 32B' },
    { id: 'command-a-vision-07-2025', name: 'Command A Vision 07 2025' },
  ];

  private getClient(): CohereClientV2 {
    return new CohereClientV2({
      token: this.getApiKey(),
    });
  }

  private mapMessagesForCohere(messages: any[]): any[] {
    return messages.map((m) => {
      if (Array.isArray(m.content)) {
        const content = m.content.map((item: any) => {
          if (item && typeof item === 'object' && item.type === 'image_url') {
            return {
              type: 'image_url',
              imageUrl: {
                url: item.image_url?.url
              }
            };
          }
          return item;
        });
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.checkRateLimit();
    this.recordRequest();
    const client = this.getClient();

    const actualModel = request.model || 'command-r-plus-08-2024';
    const processedMessages = await this.processImageMessages(request.messages);
    const response = await client.chat({
      model: actualModel,
      messages: this.mapMessagesForCohere(processedMessages),
      maxTokens: request.max_tokens,
      temperature: request.temperature,
    });

    // Map Cohere V2 response to standard ChatResponse
    return {
      id: response.id ?? '',
      choices: [
        {
          message: {
            role: 'assistant',
            content: response.message?.content?.map(c => c.type === 'text' ? c.text : '').join('') || '',
          },
          finish_reason: 'stop',
          index: 0,
        },
      ],
      usage: {
        prompt_tokens: response.usage?.tokens?.inputTokens ?? 0,
        completion_tokens: response.usage?.tokens?.outputTokens ?? 0,
        total_tokens: (response.usage?.tokens?.inputTokens ?? 0) + (response.usage?.tokens?.outputTokens ?? 0),
      },
      model: actualModel,
      object: 'chat.completion',
      created: Date.now(),
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<string> {
    this.checkRateLimit();
    this.recordRequest();
    const client = this.getClient();

    const actualModel = request.model || 'command-r-plus-08-2024';
    const processedMessages = await this.processImageMessages(request.messages);
    const stream = await client.chatStream({
      model: actualModel,
      messages: this.mapMessagesForCohere(processedMessages),
      maxTokens: request.max_tokens,
      temperature: request.temperature,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content-delta' && chunk.delta?.message?.content?.text) {
        yield chunk.delta.message.content.text;
      }
    }
  }
}
