import fetch from 'node-fetch';
import { BaseProvider } from './base.js';
import type { ChatRequest, ChatResponse, ProviderModel, RateLimits } from './types.js';

export class OllamaCloudProvider extends BaseProvider {
  name = 'Ollama Cloud';
  id = 'ollama-cloud';
  baseURL = 'https://api.ollama.com/';
  envVar = 'OLLAMA_API_KEY';
  rateLimits: RateLimits = {};
  models: ProviderModel[] = [
    { id: 'gpt-oss:20b', name: 'GPT OSS (20B)' },
    { id: 'gpt-oss:120b', name: 'GPT OSS (120B)' },
    { id: 'nemotron-3-ultra', name: 'Nemotron 3 Ultra' },
    { id: 'nemotron-3-super', name: 'Nemotron 3 Super' },
    { id: 'nemotron-3-nano:30b', name: 'Nemotron 3 Nano (30B)' },
    { id: 'gemma4:31b', name: 'Gemma 4 (31B)' },
    { id: 'minimax-m3', name: 'MiniMax M3' },
  ];

  /**
   * Ollama's native /api/chat expects `content` as a plain string with images passed
   * separately as raw base64 (no data: URL prefix) in a per-message `images` array —
   * it does not understand OpenAI-style content arrays with `image_url` blocks.
   */
  private toNativeMessages(messages: ChatRequest['messages']): Array<{ role: string; content: string; images?: string[] }> {
    return messages.map((msg: any) => {
      if (!Array.isArray(msg.content)) {
        return { role: msg.role, content: msg.content ?? '' };
      }
      const textParts: string[] = [];
      const images: string[] = [];
      for (const item of msg.content) {
        if (item?.type === 'text' && typeof item.text === 'string') {
          textParts.push(item.text);
        } else if (item?.type === 'image_url' && typeof item.image_url?.url === 'string') {
          const url = item.image_url.url;
          const base64 = url.startsWith('data:') ? url.slice(url.indexOf(',') + 1) : url;
          images.push(base64);
        }
      }
      const native: { role: string; content: string; images?: string[] } = { role: msg.role, content: textParts.join('\n') };
      if (images.length > 0) native.images = images;
      return native;
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.checkRateLimit();
    this.recordRequest();
    const apiKey = this.getApiKey();
    const url = `${this.baseURL}api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: this.toNativeMessages(request.messages),
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.max_tokens,
          top_p: request.top_p,
        },
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    const data = await response.json() as {
      model: string;
      message: { role: string; content: string };
      done: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      id: `ollama-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [
        {
          index: 0,
          message: data.message,
          finish_reason: data.done ? 'stop' : 'length',
        },
      ],
      usage: {
        prompt_tokens: data.prompt_eval_count ?? 0,
        completion_tokens: data.eval_count ?? 0,
        total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }
}
