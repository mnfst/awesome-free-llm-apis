import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fsMock } = vi.hoisted(() => ({
  fsMock: {
    pathExists: vi.fn().mockResolvedValue(true),
    stat: vi.fn().mockResolvedValue({ mtimeMs: 1000 }),
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

describe('resolveFileRefs — caps pdf:// resolution to 5 pages per pass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.pathExists.mockResolvedValue(true);
    fsMock.stat.mockResolvedValue({ mtimeMs: 1000 });
    fsMock.readFile.mockResolvedValue(Buffer.from('fake-image-bytes'));
    renderPdfPageMock.mockResolvedValue({ text: 'page text', image_path: '/tmp/page.png', total_pages: 10 });
    chatMock.mockResolvedValue({ choices: [{ message: { content: '{"is_index": false, "offset": 0}' } }] });
    longTermLoadMock.mockResolvedValue({ is_index: false, index_page: 1, offset: 0, mtimeMs: 1000 });
  });

  it('resolves only the first 5 of 7 pdf:// markers, deferring the rest with a sentinel', async () => {
    const { resolveFileRefs } = await import('../src/tools/use-free-llm.js');

    const pages = [1, 2, 3, 4, 5, 6, 7];
    const content = pages.map(p => `pdf://doc.pdf:${p}`).join(' ');
    const messages: any[] = [{ role: 'user', content }];

    await resolveFileRefs(messages[0], messages, '/fake/workspace');

    // resolvePdfRef -> renderPdfPage is only invoked for the first 5 pages.
    expect(renderPdfPageMock).toHaveBeenCalledTimes(5);

    const resultContent = typeof messages[0].content === 'string'
      ? messages[0].content
      : messages[0].content.find((p: any) => p.type === 'text')?.text;

    expect(resultContent).toContain('[PDF-Context]');
    expect(resultContent).toContain('[PDF-PAGE-DEFERRED: doc.pdf:6');
    expect(resultContent).toContain('[PDF-PAGE-DEFERRED: doc.pdf:7');
    expect(resultContent).toContain('max 5 PDF pages per pass');
  });

  it('does not cap file:// or artifact:// references — only pdf:// counts toward the limit', async () => {
    const { resolveFileRefs } = await import('../src/tools/use-free-llm.js');

    const pages = [1, 2, 3, 4, 5, 6];
    const content = pages.map(p => `pdf://doc.pdf:${p}`).join(' ') + ' file:///does/not/exist.txt';
    const messages: any[] = [{ role: 'user', content }];

    await resolveFileRefs(messages[0], messages, '/fake/workspace');

    // The pdf-specific cap doesn't consume/count the unrelated file:// reference — still
    // exactly 5 pdf pages resolved regardless of other reference types present.
    expect(renderPdfPageMock).toHaveBeenCalledTimes(5);
    const resultContent = typeof messages[0].content === 'string'
      ? messages[0].content
      : messages[0].content.find((p: any) => p.type === 'text')?.text;
    expect(resultContent).toContain('[PDF-PAGE-DEFERRED: doc.pdf:6');
  });
});
