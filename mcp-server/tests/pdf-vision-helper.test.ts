import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/providers/registry.js', () => ({
  ProviderRegistry: {
    getInstance: () => ({
      getAvailableProviders: () => [
        {
          id: 'gemini',
          models: [{ id: 'gemini-3.1-flash-lite' }],
          isAvailable: () => true,
          chat: async () => ({
            choices: [{ message: { content: 'Mocked vision description.' } }]
          })
        }
      ]
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
});
