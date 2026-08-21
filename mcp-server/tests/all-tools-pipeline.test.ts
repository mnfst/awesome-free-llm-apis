import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateProvider } from '../src/tools/validate-provider.js';
import { getTokenStats } from '../src/tools/get-token-stats.js';
import { indexWorkspace } from '../src/tools/index-workspace.js';
import { manageMemory } from '../src/tools/manage-memory.js';
import { listAvailableFreeModels } from '../src/tools/list-models.js';
import { initWorkspace } from '../src/tools/init-workspace.js';
import { visionTool } from '../src/tools/vision-tool.js';
import { runCodeMode } from '../src/tools/code-mode.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { WorkspaceIndexer } from '../src/memory/indexer.js';
import { MemoryManager } from '../src/memory/index.js';

describe('All Tools Pipeline Comprehensive Coverage', () => {
  describe('validateProvider', () => {
    it('throws error when provider is not found', async () => {
      await expect(validateProvider('non-existent-provider-xyz')).rejects.toThrow('not found');
    });

    it('returns isPlaceholder for unavailable provider', async () => {
      const mockProvider: any = {
        name: 'test-provider',
        isAvailable: () => false,
        models: [{ id: 'test-model', name: 'Test Model' }],
      };
      vi.spyOn(ProviderRegistry.getInstance(), 'getProvider').mockReturnValue(mockProvider);

      const result = await validateProvider('test-provider');
      expect(result.success).toBe(false);
      expect(result.isPlaceholder).toBe(true);
    });

    it('returns error when provider has no models defined', async () => {
      const mockProvider: any = {
        name: 'empty-models-provider',
        isAvailable: () => true,
        models: [],
      };
      vi.spyOn(ProviderRegistry.getInstance(), 'getProvider').mockReturnValue(mockProvider);

      const result = await validateProvider('empty-models-provider');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No models defined');
    });

    it('returns success and latency for healthy responsive provider', async () => {
      const mockProvider: any = {
        name: 'healthy-provider',
        isAvailable: () => true,
        models: [{ id: 'model-1', name: 'Model 1' }],
        chat: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'pong' } }],
          _headers: { 'x-response-time': '120ms' },
        }),
      };
      vi.spyOn(ProviderRegistry.getInstance(), 'getProvider').mockReturnValue(mockProvider);

      const result = await validateProvider('healthy-provider');
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBe('120ms');
    });
  });

  describe('getTokenStats', () => {
    it('returns formatted token stats and server totals', async () => {
      const mockProvider: any = {
        id: 'stats-provider',
        name: 'Stats Provider',
        isAvailable: () => true,
        rateLimits: { requests: 50 },
      };
      vi.spyOn(ProviderRegistry.getInstance(), 'getAllProviders').mockReturnValue([mockProvider]);

      const result = await getTokenStats();
      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(Array.isArray(result.stats)).toBe(true);
      expect(result.stats.find((s: any) => s.id === 'stats-provider')).toBeDefined();
      expect(result.serverTotals).toBeDefined();
    });
  });

  describe('indexWorkspace', () => {
    it('indexes workspace using WorkspaceIndexer singleton with default force=false', async () => {
      const indexSpy = vi.spyOn(WorkspaceIndexer.prototype, 'indexWorkspace').mockResolvedValue(undefined as any);

      await indexWorkspace({ workspace_root: process.cwd() });
      expect(indexSpy).toHaveBeenCalledWith(process.cwd(), false);
    });

    it('indexes workspace with force=true when specified', async () => {
      const indexSpy = vi.spyOn(WorkspaceIndexer.prototype, 'indexWorkspace').mockResolvedValue(undefined as any);

      await indexWorkspace({ workspace_root: process.cwd(), force: true });
      expect(indexSpy).toHaveBeenCalledWith(process.cwd(), true);
    });
  });

  describe('listAvailableFreeModels', () => {
    it('lists all models across all registered providers', async () => {
      const mockProvider: any = {
        id: 'p1',
        name: 'Provider 1',
        isAvailable: () => true,
        models: [{ id: 'm1', name: 'Model 1' }, { id: 'm2', name: 'Model 2' }],
        rateLimits: {},
      };
      vi.spyOn(ProviderRegistry.getInstance(), 'getAllProviders').mockReturnValue([mockProvider]);

      const result = await listAvailableFreeModels({});
      expect(result.models.length).toBeGreaterThanOrEqual(2);
      expect(result.models.some((m: any) => m.modelId === 'm1')).toBe(true);
      expect(result.summary).toContain('models');
    });

    it('filters models by provider', async () => {
      const mockProvider: any = {
        id: 'target-p',
        name: 'Target Provider',
        isAvailable: () => true,
        models: [{ id: 'target-m', name: 'Target Model' }],
        rateLimits: {},
      };
      vi.spyOn(ProviderRegistry.getInstance(), 'getProvider').mockReturnValue(mockProvider);

      const result = await listAvailableFreeModels({ provider: 'target-p' });
      expect(result.models.map((m: any) => m.modelId)).toContain('target-m');
    });
  });

  describe('manageMemory error boundaries', () => {
    it('throws error when wiki_write is missing required title or content', async () => {
      await expect(manageMemory({ action: 'wiki_write' as any, title: '' })).rejects.toThrow();
    });

    it('throws error when wiki_read is missing title', async () => {
      await expect(manageMemory({ action: 'wiki_read' as any })).rejects.toThrow();
    });

    it('throws error on unsupported action', async () => {
      await expect(manageMemory({ action: 'unsupported_action' as any })).rejects.toThrow('Unsupported action');
    });
  });

  describe('visionTool boundary checks', () => {
    it('throws error when image_path is missing or non-file scheme', async () => {
      await expect(visionTool({ image_path: '' })).rejects.toThrow('image_path');
      await expect(visionTool({ image_path: 'http://example.com/pic.jpg' })).rejects.toThrow('file:///');
    });

    it('throws error when image_path is outside workspace_root boundaries', async () => {
      const fakeOutsideUri = 'file:///C:/Windows/System32/drivers/etc/hosts';
      await expect(visionTool({
        image_path: fakeOutsideUri,
        workspace_root: 'C:/Users/mahes/project',
      })).rejects.toThrow('workspace_root boundaries');
    });
  });

  describe('runCodeMode mode detection & execution', () => {
    it('auto-detects mode from code contents', async () => {
      const codingRes = await runCodeMode({ code: 'const x = 10; function test() { return x; }' });
      expect(codingRes.mode).toBe('coding');

      const researchRes = await runCodeMode({ code: 'fetch("https://api.example.com/data")' });
      expect(researchRes.mode).toBe('research');
    });
  });
});
