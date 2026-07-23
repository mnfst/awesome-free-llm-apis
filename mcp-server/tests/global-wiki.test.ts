import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GlobalWikiManager } from '../src/utils/GlobalWikiManager.js';
import { useFreeLLM, executeServerToolCall } from '../src/tools/use-free-llm.js';

describe('GlobalWikiManager', () => {
  beforeEach(() => {
    GlobalWikiManager.reset();
    vi.restoreAllMocks();
  });

  it('should track successes', () => {
    GlobalWikiManager.logSuccess('read_file');
    GlobalWikiManager.logSuccess('read_file');
    expect(GlobalWikiManager.getStats()['read_file']).toEqual({ successes: 2, failures: 0 });
  });

  it('should track failures', () => {
    GlobalWikiManager.logFailure('write_file');
    expect(GlobalWikiManager.getStats()['write_file']).toEqual({ successes: 0, failures: 1 });
  });

  it('should reset stats', () => {
    GlobalWikiManager.logSuccess('read_file');
    GlobalWikiManager.reset();
    expect(GlobalWikiManager.getStats()).toEqual({});
  });

  describe('executeServerToolCall integration', () => {
    it('should log success on successful tool execution', async () => {
      // Mock get_token_stats to return mock stats
      const result = await executeServerToolCall({ tool: 'get_token_stats', args: {} });
      expect(result).toBeDefined();
      expect(GlobalWikiManager.getStats()['get_token_stats']).toEqual({ successes: 1, failures: 0 });
    });

    it('should log failure on failed tool execution', async () => {
      await expect(executeServerToolCall({ tool: 'invalid_tool_name', args: {} })).rejects.toThrow();
      expect(GlobalWikiManager.getStats()['invalid_tool_name']).toEqual({ successes: 0, failures: 1 });
    });
  });
});
