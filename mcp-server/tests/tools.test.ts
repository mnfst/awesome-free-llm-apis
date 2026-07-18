import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listAvailableFreeModels } from '../src/tools/list-models.js';
import { runCodeMode } from '../src/tools/code-mode.js';
import { useFreeLLM } from '../src/tools/use-free-llm.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { getSharedResponseCache } from '../src/pipeline/instances.js';
import { TaskType } from '../src/pipeline/middleware.js';

// Mock debounce to be immediate
vi.mock('../src/utils/debounce.js', () => ({
    debounce: vi.fn((fn: any) => {
        const d = (...args: any[]) => fn(...args);
        d.flush = () => {};
        return d;
    })
}));

describe('list_available_free_models', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    (ProviderRegistry as unknown as { instance: undefined }).instance = undefined;
    getSharedResponseCache().clear();
  });

  it('returns correct structure', async () => {
    const result = await listAvailableFreeModels({});
    expect(result).toHaveProperty('models');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.models)).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
  });

  it('filters by provider', async () => {
    const result = await listAvailableFreeModels({ provider: 'groq' });
    expect(result.models.every((m) => m.providerId === 'groq')).toBe(true);
  });

  it('available_only filters out providers without keys', async () => {
    delete process.env.GROQ_API_KEY;
    const result = await listAvailableFreeModels({ available_only: true });
    expect(result.models.every((m) => m.available)).toBe(true);
  });
});

describe('code_mode', () => {
  it('executes code and returns stdout', async () => {
    const result = await runCodeMode({ code: 'print("test output")' });
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('test output');
  });

  it('computes compression ratio when data is provided', async () => {
    const data = 'a'.repeat(100);
    const result = await runCodeMode({
      code: 'print(DATA.slice(0, 10))',
      data,
    });
    expect(result.compressionRatio).toBeDefined();
    expect(result.compressionRatio!).toBeLessThan(1);
  });

  it('returns executionTimeMs', async () => {
    const result = await runCodeMode({ code: 'print("done")' });
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('use_free_llm input validation', () => {
  it('throws when no provider available for model', async () => {
    vi.spyOn(ProviderRegistry.getInstance(), 'getAvailableProviders').mockReturnValue([]);
    await expect(
      useFreeLLM({
        model: 'nonexistent-model',
        messages: [{ role: 'user', content: 'hello' }],
        fallback: false,
      })
    ).rejects.toThrow();
  });

  it('uses cache on second call', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key-long-enough');
    (ProviderRegistry as unknown as { instance: undefined }).instance = undefined;

    const mockResponse = {
      id: 'cached-id',
      object: 'chat.completion',
      created: Date.now(),
      model: 'llama-3.3-70b-versatile',
      choices: [{ index: 0, message: { role: 'assistant', content: 'cached' }, finish_reason: 'stop' }],
    };

    // Get the registry instance that the lazy router will also use
    const registry = ProviderRegistry.getInstance();
    const groq = registry.getProvider('groq');
    if (!groq) return;

    const chatSpy = vi.spyOn(groq, 'chat').mockResolvedValue(mockResponse);

    const input = {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user' as const, content: 'unique-cache-test-xyz' }],
    };

    await useFreeLLM(JSON.parse(JSON.stringify(input)));
    // Small delay to ensure cache is fully settled
    await new Promise(resolve => setTimeout(resolve, 50));
    await useFreeLLM(JSON.parse(JSON.stringify(input)));
    expect(chatSpy).toHaveBeenCalledTimes(1);
  });

  it('appends token-efficient CLI diagnostics for debugger persona', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key-long-enough');
    (ProviderRegistry as unknown as { instance: undefined }).instance = undefined;

    const mockResponse = {
      id: 'debug-test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: 'llama-3.3-70b-versatile',
      choices: [{ index: 0, message: { role: 'assistant' as const, content: 'Base response' }, finish_reason: 'stop' }],
    };

    const registry = ProviderRegistry.getInstance();
    const groq = registry.getProvider('groq');
    if (!groq) return;

    vi.spyOn(groq, 'chat').mockResolvedValue(mockResponse);

    const result = await useFreeLLM({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'fix TypeError JSON error in my project' }],
      workspace_root: process.cwd()
    });

    const content = result.choices[0].message.content || '';
    expect(content).toContain('Token-Efficient CLI Diagnostics');
    
    // Since query has 'json' and 'error', it should contain JSON tips
    if (process.platform === 'win32') {
      expect(content).toContain('ConvertFrom-Json');
    } else {
      expect(content).toContain('jq');
    }
  });

  it('does NOT append CLI diagnostics for vision tasks even under debugger persona', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key-long-enough');
    (ProviderRegistry as unknown as { instance: undefined }).instance = undefined;

    const mockResponse = {
      id: 'vision-debug-test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: 'llama-3.3-70b-versatile',
      choices: [{ index: 0, message: { role: 'assistant' as const, content: 'Base response' }, finish_reason: 'stop' }],
    };

    const registry = ProviderRegistry.getInstance();
    const groq = registry.getProvider('groq');
    if (!groq) return;

    vi.spyOn(groq, 'chat').mockResolvedValue(mockResponse);

    const result = await useFreeLLM({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'fix TypeError JSON error in my project for vision' }],
      workspace_root: process.cwd(),
      taskType: TaskType.Vision
    } as any);

    const content = result.choices[0].message.content || '';
    expect(content).not.toContain('Token-Efficient CLI Diagnostics');
  });
});
