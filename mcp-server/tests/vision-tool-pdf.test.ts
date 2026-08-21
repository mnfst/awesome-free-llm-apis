import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

const { renderPdfPageMock } = vi.hoisted(() => ({
  renderPdfPageMock: vi.fn(),
}));

vi.mock('../src/utils/PdfRenderer.js', () => ({
  renderPdfPage: renderPdfPageMock,
}));

const mockProvider = {
  id: 'gemini',
  name: 'Gemini',
  models: [{ id: 'gemini-3.1-flash-lite' }],
  visionModels: [{ id: 'gemini-3.1-flash-lite' }],
  isAvailable: () => true,
  chat: vi.fn().mockResolvedValue({
    id: 'test-resp',
    choices: [{ message: { role: 'assistant', content: 'This is a visual analysis of page 1.' } }],
    model: 'gemini-3.1-flash-lite'
  })
};

vi.mock('../src/providers/registry.js', () => ({
  ProviderRegistry: {
    getInstance: () => ({
      getAvailableProviders: () => [mockProvider],
      getAvailableVisionModels: () => [{ provider: mockProvider, model: { id: 'gemini-3.1-flash-lite' } }],
      getProvider: () => mockProvider,
    })
  }
}));

import { visionTool } from '../src/tools/vision-tool.js';
import { getSharedResponseCache } from '../src/pipeline/instances.js';

describe('vision_tool PDF Ingestion', () => {
  const dummyPdfPath = path.join(process.cwd(), 'scratch', 'test_doc.pdf');
  const dummyPngPath = path.join(process.cwd(), 'scratch', 'rendered_p1.png');

  beforeEach(async () => {
    await fs.mkdir(path.dirname(dummyPdfPath), { recursive: true });
    await fs.writeFile(dummyPdfPath, '%PDF-1.5 test binary');
    await fs.writeFile(dummyPngPath, 'fake-png-data');
    mockProvider.chat.mockClear();
    renderPdfPageMock.mockReset();
    getSharedResponseCache().clear();
  });

  it('renders PDF to PNG and extracts text when image_path is a .pdf', async () => {
    renderPdfPageMock.mockResolvedValue({
      text: 'Extracted PDF Page 1 Content: Ethical Hacking Report',
      image_path: dummyPngPath,
      total_pages: 5,
      image_coverage_ratio: 0.25,
      image_blocks: []
    });

    const fileUri = `file:///${dummyPdfPath.replace(/\\/g, '/')}`;
    const result = await visionTool({
      image_path: fileUri,
      prompt: `Analyze visual charts on this page ${Date.now()}`
    });

    expect(renderPdfPageMock).toHaveBeenCalledWith(path.resolve(dummyPdfPath), 1);
    expect(result.response).toContain('This is a visual analysis of page 1.');
    expect(mockProvider.chat).toHaveBeenCalled();
    const chatCall = mockProvider.chat.mock.calls[0][0];
    const imageUrlItem = chatCall.messages[0].content.find((c: any) => c.type === 'image_url');
    expect(imageUrlItem).toBeDefined();
    expect(imageUrlItem.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it('handles page specification suffix in PDF URI (e.g. .pdf:3)', async () => {
    renderPdfPageMock.mockResolvedValue({
      text: 'Extracted Page 3 Text',
      image_path: dummyPngPath,
      total_pages: 5,
      image_coverage_ratio: 0.10,
    });

    const fileUri = `file:///${dummyPdfPath.replace(/\\/g, '/')}:3`;
    const result = await visionTool({
      image_path: fileUri,
      prompt: 'Analyze page 3'
    });

    expect(renderPdfPageMock).toHaveBeenCalledWith(path.resolve(dummyPdfPath), 3);
    expect(result.response).toBeDefined();
  });
});
