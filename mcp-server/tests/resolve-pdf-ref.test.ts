import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fsMock } = vi.hoisted(() => ({
  fsMock: {
    pathExists: vi.fn().mockResolvedValue(true),
    stat: vi.fn(),
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image-bytes')),
  }
}));
vi.mock('fs-extra', () => ({ default: fsMock, ...fsMock }));

const { renderPdfPageMock } = vi.hoisted(() => ({ renderPdfPageMock: vi.fn() }));
vi.mock('../src/utils/PdfRenderer.js', () => ({ renderPdfPage: renderPdfPageMock }));

const { longTermLoadMock, longTermSaveMock } = vi.hoisted(() => ({
  longTermLoadMock: vi.fn(),
  longTermSaveMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/memory/index.js', () => ({
  memoryManager: {
    longTerm: { load: longTermLoadMock, save: longTermSaveMock },
    getWiki: vi.fn().mockReturnValue({ search: vi.fn().mockResolvedValue([]), write: vi.fn().mockResolvedValue({}) }),
  }
}));

vi.mock('../src/memory/pdf-wiki.js', () => ({
  maybeIndexPdfIntoWiki: vi.fn().mockResolvedValue(undefined),
}));

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('../src/providers/registry.js', () => {
  const mockProvider = {
    id: 'mock-provider',
    models: [{ id: 'mock-model' }],
    visionModels: [{ id: 'mock-model' }],
    chat: chatMock,
  };
  return {
    ProviderRegistry: {
      getInstance: vi.fn().mockReturnValue({
        getAvailableProviders: () => [mockProvider],
        getProvider: () => mockProvider,
        getAvailableVisionModels: () => mockProvider.visionModels.map(model => ({ provider: mockProvider, model })),
      })
    }
  };
});

describe('resolvePdfRef offset-cache staleness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.pathExists.mockResolvedValue(true);
    fsMock.readFile.mockResolvedValue(Buffer.from('fake-image-bytes'));
    renderPdfPageMock.mockResolvedValue({ text: 'page text', image_path: '/tmp/page.png', total_pages: 5 });
    chatMock.mockResolvedValue({ choices: [{ message: { content: '{"is_index": false, "offset": 0}' } }] });
    longTermSaveMock.mockResolvedValue(undefined);
  });

  it('trusts a cached offset when the PDF mtime matches the cached mtimeMs', async () => {
    fsMock.stat.mockResolvedValue({ mtimeMs: 1000 });
    longTermLoadMock.mockResolvedValue({ is_index: true, index_page: 1, offset: 3, mtimeMs: 1000 });

    const { resolvePdfRef } = await import('../src/tools/use-free-llm.js');
    await resolvePdfRef('doc.pdf:2', '/fake/workspace');

    // Cached offset trusted -> physical page = 2 + 3 = 5, no re-classification call.
    expect(renderPdfPageMock).toHaveBeenCalledWith(expect.any(String), 5);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('re-runs classification and ignores the stale offset when the PDF mtime has changed', async () => {
    fsMock.stat.mockResolvedValue({ mtimeMs: 2000 }); // file changed since it was cached
    longTermLoadMock.mockResolvedValue({ is_index: true, index_page: 1, offset: 3, mtimeMs: 1000 });

    const { resolvePdfRef } = await import('../src/tools/use-free-llm.js');
    await resolvePdfRef('doc.pdf:2', '/fake/workspace');

    // Stale offset not applied -> physical page = requested page (2), and classification re-runs.
    expect(renderPdfPageMock).toHaveBeenCalledWith(expect.any(String), 2);
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(longTermSaveMock).toHaveBeenCalledWith(
      expect.stringContaining('pdf:index:'),
      expect.objectContaining({ mtimeMs: 2000 })
    );
  });

  it('runs classification on first-ever resolution (no cached index) and persists mtimeMs', async () => {
    fsMock.stat.mockResolvedValue({ mtimeMs: 500 });
    longTermLoadMock.mockResolvedValue(undefined);

    const { resolvePdfRef } = await import('../src/tools/use-free-llm.js');
    await resolvePdfRef('doc.pdf:1', '/fake/workspace');

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(longTermSaveMock).toHaveBeenCalledWith(
      expect.stringContaining('pdf:index:'),
      expect.objectContaining({ mtimeMs: 500 })
    );
  });
});
