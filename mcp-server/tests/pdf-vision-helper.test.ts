import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from '../src/providers/registry.js';

const mockProvider = {
  id: 'gemini',
  models: [{ id: 'gemini-3.1-flash-lite' }],
  isAvailable: () => true,
  chat: async (params?: any) => ({
    choices: [{ message: { content: 'Mocked vision description.' } }]
  })
};

vi.mock('../src/providers/registry.js', () => ({
  ProviderRegistry: {
    getInstance: () => ({
      getAvailableProviders: () => [mockProvider],
      getAvailableVisionModels: () => [{ provider: mockProvider, model: { id: 'gemini-3.1-flash-lite' } }],
    })
  }
}));

import { shouldUseVision, buildVisionPrompt, describePageVision } from '../src/utils/PdfVisionHelper.js';

describe('PdfVisionHelper', () => {
  it('shouldUseVision returns false below coverage threshold', () => {
    expect(shouldUseVision(0.01, 'some text')).toBe(false);
  });

  it('shouldUseVision returns true when coverage high and text is sparse', () => {
    expect(shouldUseVision(0.15, 'sparse')).toBe(true);
  });

  it('shouldUseVision returns false when coverage is high but text is extremely rich', () => {
    expect(shouldUseVision(0.20, 'word '.repeat(1000))).toBe(false);
  });

  it('buildVisionPrompt includes pdfBasename and page number', () => {
    const p = buildVisionPrompt('test.pdf', 5, false);
    expect(p).toContain('test.pdf');
    expect(p).toContain('page 5');
  });

  it('buildVisionPrompt splices surrounding pageText and wikiContext', () => {
    const p = buildVisionPrompt('test.pdf', 5, true, 'Surrounding details', 'Rolling wiki knowledge');
    expect(p).toContain('Document context');
    expect(p).toContain('Rolling wiki knowledge');
    expect(p).toContain('Surrounding page text context');
    expect(p).toContain('Surrounding details');
  });

  it('describePageVision works and merges descriptions', async () => {
    // Write a dummy file to read
    const fs = await import('fs-extra');
    const path = await import('path');
    const dummyPath = path.join(process.cwd(), 'scratch', 'dummy_test.png');
    await fs.ensureDir(path.dirname(dummyPath));
    await fs.writeFile(dummyPath, 'dummy data');

    const desc = await describePageVision(dummyPath, 'test.pdf', 5, [
      { image_path: dummyPath, rect: [0, 0, 10, 10], width_pt: 10, height_pt: 10 }
    ]);

    expect(desc).toContain('[Visual Layout & Summary — page 5]');
    expect(desc).toContain('[Figure 1 details — page 5]');
    expect(desc).toContain('Mocked vision description.');

    await fs.remove(dummyPath);
  });

  it('describePageVision adjusts max_tokens dynamically', async () => {
    const chatSpy = vi.spyOn(mockProvider, 'chat');

    const fs = await import('fs-extra');
    const path = await import('path');
    const dummyPath = path.join(process.cwd(), 'scratch', 'dummy_test_tokens.png');
    await fs.ensureDir(path.dirname(dummyPath));
    await fs.writeFile(dummyPath, 'dummy data');

    try {
      // 1. First pass (no wiki context) -> expecting 500 for full page
      await describePageVision(dummyPath, 'test.pdf', 5, [], 'page text', '');
      expect(chatSpy).toHaveBeenCalled();
      expect(chatSpy.mock.calls[0][0].max_tokens).toBe(500);

      chatSpy.mockClear();

      // 2. Subsequent pass (with wiki context) -> expecting 300 for full page
      await describePageVision(dummyPath, 'test.pdf', 5, [], 'page text', 'existing wiki content');
      expect(chatSpy.mock.calls[0][0].max_tokens).toBe(300);

      chatSpy.mockClear();

      // 3. Sub-blocks -> expecting area-scaled tokens between 100 and 200
      // A 200x200 pt crop has area 40000. 40000 / 500000 * 800 = 64 -> floor capped at 100
      await describePageVision(dummyPath, 'test.pdf', 5, [
        { image_path: dummyPath, rect: [0, 0, 200, 200], width_pt: 200, height_pt: 200 }
      ], 'page text', 'existing wiki content');
      
      const tokensTried = chatSpy.mock.calls.map(c => c[0].max_tokens);
      expect(tokensTried).toContain(300);
      expect(tokensTried).toContain(100);
    } finally {
      await fs.remove(dummyPath);
      chatSpy.mockRestore();
    }
  });
});
