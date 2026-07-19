export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | any; // Supports multi-modal arrays or objects
}

export interface ChatRequest {
  model?: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  agentic?: boolean;
  response_format?: { type: 'json_object' | 'text' } | { type: 'json_schema', json_schema?: { name: string, strict?: boolean, schema: any } } | any;
  google_search?: boolean;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  sessionId?: string;
  allowRetries?: boolean;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  _headers?: Record<string, string>;
  /** Provider id that actually served this response — stamped by LLMExecutor.tryProvider(), used for tracing. */
  _providerId?: string;
}

export interface RateLimits {
  rpm?: number;
  rpd?: number;
  rps?: number;
  tokensPerMonth?: number;
  reqPerMonth?: number;
}

export interface ProviderModel {
  id: string;
  name: string;
  contextWindow?: number;
  capabilities?: string[];
  score?: number;
}

export interface Provider {
  name: string;
  id: string;
  baseURL: string;
  models: ProviderModel[];
  /** Vision-capable models for this provider. Separate from text models. */
  visionModels: ProviderModel[];
  rateLimits: RateLimits;
  envVar: string;
  consecutiveFailures: number;
  isAvailable(): boolean;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<string>;
  getPenaltyScore(): number;
  recordFailure(status: number): void;
  getUsageStats(): { requestCountMinute: number; requestCountDay: number };
}
