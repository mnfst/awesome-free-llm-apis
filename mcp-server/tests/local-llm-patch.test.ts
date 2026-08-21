import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { rankCandidateModels } from '../src/providers/ollama-local.js';

vi.mock('../src/providers/ollama-local.js', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    listLocalModels: vi.fn(),
    chatLocal: vi.fn(),
  };
});

vi.mock('../src/pipeline/middlewares/context-gatherer.js', () => ({
  ContextGatherer: {
    gatherContext: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../src/utils/ChatLogger.js', () => ({
  logToolCall: vi.fn().mockResolvedValue(undefined),
}));

import { listLocalModels, chatLocal } from '../src/providers/ollama-local.js';
import { localLlmPatch } from '../src/tools/local-llm-patch.js';

describe('rankCandidateModels', () => {
  it('orders a coder-named model ahead of generic ones', () => {
    expect(rankCandidateModels(['llama3.1:8b', 'qwen2.5-coder:7b', 'mistral:7b']))
      .toEqual(['qwen2.5-coder:7b', 'llama3.1:8b', 'mistral:7b']);
  });

  it('preserves original order among non-coder-named models', () => {
    expect(rankCandidateModels(['llama3.1:8b', 'mistral:7b'])).toEqual(['llama3.1:8b', 'mistral:7b']);
  });

  it('recognizes devstral and deepseek-coder variants as coding-oriented', () => {
    expect(rankCandidateModels(['mistral:7b', 'devstral-small:24b'])[0]).toBe('devstral-small:24b');
    expect(rankCandidateModels(['mistral:7b', 'deepseek-coder-v2:16b'])[0]).toBe('deepseek-coder-v2:16b');
  });

  it('does not filter anything out by name — an embedding-model-looking name still appears', () => {
    // Whether a model can actually chat is only knowable by trying /api/chat
    // for real (see local-llm-patch.ts's try-each-candidate loop) — ranking
    // never excludes candidates based on a name guess.
    const ranked = rankCandidateModels(['nomic-embed-text', 'qwen2.5-coder:7b']);
    expect(ranked).toContain('nomic-embed-text');
    expect(ranked[0]).toBe('qwen2.5-coder:7b');
  });
});

describe('local_llm_patch', () => {
  const testDir = path.join(os.tmpdir(), 'local-llm-patch-test-' + Date.now());
  const testFile = path.join(testDir, 'sample.ts');

  beforeEach(async () => {
    await fs.ensureDir(testDir);
    await fs.writeFile(testFile, 'export function add(a: number, b: number) { return a + b; }');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  it('fails fast with a clear error when no local Ollama server is reachable', async () => {
    (listLocalModels as any).mockRejectedValue(new Error('fetch failed'));
    const result = await localLlmPatch({ filePath: testFile, instruction: 'add JSDoc' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not reach a local Ollama server');
    expect(chatLocal).not.toHaveBeenCalled();
  });

  it('fails fast with a clear error when the server has no models pulled', async () => {
    (listLocalModels as any).mockResolvedValue([]);
    const result = await localLlmPatch({ filePath: testFile, instruction: 'add JSDoc' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No models available');
  });

  it('errors for a nonexistent file without calling the model', async () => {
    (listLocalModels as any).mockResolvedValue(['qwen2.5-coder:7b']);
    const result = await localLlmPatch({ filePath: path.join(testDir, 'nope.ts'), instruction: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
    expect(listLocalModels).not.toHaveBeenCalled();
  });

  it('picks a coding model, calls the local server, and extracts the fenced patch', async () => {
    (listLocalModels as any).mockResolvedValue(['llama3.1:8b', 'qwen2.5-coder:7b']);
    (chatLocal as any).mockResolvedValue({
      model: 'qwen2.5-coder:7b',
      content: 'Here you go:\n```ts\n/** Adds two numbers. */\nexport function add(a: number, b: number) { return a + b; }\n```',
      promptTokens: 10,
      completionTokens: 20,
    });

    const result = await localLlmPatch({ filePath: testFile, instruction: 'add JSDoc' });
    expect(result.success).toBe(true);
    expect(result.modelUsed).toBe('qwen2.5-coder:7b');
    expect(result.usedFallbackModel).toBe(false);
    expect(result.patch).toContain('/** Adds two numbers. */');
    expect(result.patch).not.toContain('```');

    // Never writes to disk.
    const stillOriginal = await fs.readFile(testFile, 'utf-8');
    expect(stillOriginal).toBe('export function add(a: number, b: number) { return a + b; }');
  });

  it('falls through to the next candidate when a model rejects /api/chat (e.g. an embedding-only model)', async () => {
    // qwen2.5-coder is ranked first but /api/chat rejects it here — proves
    // the fallthrough is driven by a real call failing, not a name guess.
    (listLocalModels as any).mockResolvedValue(['nomic-embed-text', 'qwen2.5-coder:7b']);
    (chatLocal as any).mockImplementation(async (model: string) => {
      if (model === 'qwen2.5-coder:7b') {
        throw new Error('this model does not support chat');
      }
      return { model, content: 'export function add(a: number, b: number) { return a + b; }', promptTokens: 1, completionTokens: 1 };
    });

    const result = await localLlmPatch({ filePath: testFile, instruction: 'add JSDoc' });
    expect(result.success).toBe(true);
    expect(result.modelUsed).toBe('nomic-embed-text');
    expect(result.usedFallbackModel).toBe(true);
    expect(chatLocal).toHaveBeenCalledTimes(2);
  });

  it('reports every attempted model when all candidates reject /api/chat', async () => {
    (listLocalModels as any).mockResolvedValue(['a', 'b']);
    (chatLocal as any).mockRejectedValue(new Error('not a chat model'));

    const result = await localLlmPatch({ filePath: testFile, instruction: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('a: not a chat model');
    expect(result.error).toContain('b: not a chat model');
  });

  it('returns raw content unchanged when the model does not wrap its response in a code fence', async () => {
    (listLocalModels as any).mockResolvedValue(['qwen2.5-coder:7b']);
    (chatLocal as any).mockResolvedValue({
      model: 'qwen2.5-coder:7b',
      content: 'export function add(a: number, b: number) { return a + b; }',
      promptTokens: 5,
      completionTokens: 5,
    });

    const result = await localLlmPatch({ filePath: testFile, instruction: 'no-op' });
    expect(result.success).toBe(true);
    expect(result.patch).toBe('export function add(a: number, b: number) { return a + b; }');
  });
});
