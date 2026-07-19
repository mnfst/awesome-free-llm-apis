import { describe, it, expect } from 'vitest';
import { wikiConfig } from '../src/config/wiki-config.js';

describe('wikiConfig', () => {
  it('exposes all required fields with sane defaults', () => {
    expect(wikiConfig.maxPageSizeBytes).toBe(8192);
    expect(wikiConfig.maxPageBodyBytes).toBeLessThan(wikiConfig.maxPageSizeBytes);
    expect(wikiConfig.maxTokensLlmResponse).toBeGreaterThan(0);
    expect(wikiConfig.chunkSize).toBeGreaterThan(0);
    expect(wikiConfig.ragTopK).toBeGreaterThan(0);
  });

  it('maxPageBodyBytes leaves room for frontmatter overhead', () => {
    const overhead = wikiConfig.maxPageSizeBytes - wikiConfig.maxPageBodyBytes;
    expect(overhead).toBeGreaterThanOrEqual(400);
  });
});
