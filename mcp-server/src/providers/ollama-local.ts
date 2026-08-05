import fetch from 'node-fetch';

/**
 * Standalone helper for a genuinely LOCAL Ollama server (http://localhost:11434
 * by default) — distinct from src/providers/ollama-cloud.ts's OllamaCloudProvider,
 * which talks to Ollama's hosted cloud API with Bearer auth. This one has no auth
 * (local servers don't need it) and a 2-endpoint surface (`/api/tags`, `/api/chat`),
 * so it uses node-fetch directly rather than pulling in the `ollama` npm package —
 * matching this repo's existing preference for minimal-dependency HTTP clients
 * (see ollama-cloud.ts's own plain-fetch approach).
 *
 * Deliberately NOT registered into ProviderRegistry/TextRouterMiddleware's normal
 * routing: it's localhost-only and optional (no server running = every call
 * fails), and the general fallback loop shouldn't try-and-fail against a host
 * that may not exist. Tools that want it (local-llm-patch.ts) call it directly.
 */

export interface OllamaLocalMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaLocalChatResult {
  model: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
}

function getBaseUrl(): string {
  return (process.env.OLLAMA_LOCAL_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
}

/** Lists model tags available on the local Ollama server, e.g. ["qwen2.5-coder:7b", "llama3.1:8b"]. */
export async function listLocalModels(): Promise<string[]> {
  const url = `${getBaseUrl()}/api/tags`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ollama local server responded HTTP ${response.status} for ${url}`);
  }
  const data = await response.json() as { models?: Array<{ name: string }> };
  return (data.models || []).map(m => m.name);
}

/**
 * Orders the available tags list with coding-oriented names first — a
 * preference ranking only, NOT a filter. /api/tags has no reliable field
 * saying "this is an embedding-only model" (nomic-embed-text, bge-*, etc. —
 * name conventions vary and aren't guaranteed), so whether a model actually
 * supports /api/chat can only be determined empirically by trying it. Callers
 * should walk this list in order, attempt a real chatLocal() call, and fall
 * through to the next candidate on failure (see local-llm-patch.ts) — that
 * failure IS the chat-capability check, not a name guess.
 */
export function rankCandidateModels(availableModels: string[]): string[] {
  const codingPatterns = [/codellama/i, /qwen.*coder/i, /devstral/i, /deepseek.*coder/i, /coder/i];
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const m of availableModels) {
    if (codingPatterns.some(p => p.test(m))) preferred.push(m);
    else rest.push(m);
  }
  return [...preferred, ...rest];
}

export async function chatLocal(model: string, messages: OllamaLocalMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<OllamaLocalChatResult> {
  const url = `${getBaseUrl()}/api/chat`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature,
        num_predict: options?.maxTokens,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama local server responded HTTP ${response.status}: ${text}`);
  }
  const data = await response.json() as {
    model: string;
    message: { role: string; content: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    model: data.model,
    content: data.message?.content || '',
    promptTokens: data.prompt_eval_count ?? 0,
    completionTokens: data.eval_count ?? 0,
  };
}
