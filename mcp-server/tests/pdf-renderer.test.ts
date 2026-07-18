import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }));

vi.mock('node:child_process', () => ({
  exec: execMock,
}));

function mockExecOnce(stdout: string) {
  execMock.mockImplementationOnce((_cmd: string, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
    cb(null, { stdout, stderr: '' });
  });
}

describe('renderPdfPage', () => {
  beforeEach(() => {
    execMock.mockReset();
  });

  it('parses a successful {text, image_path, total_pages} response', async () => {
    mockExecOnce(JSON.stringify({ text: 'Page one content', image_path: '/tmp/page1.png', total_pages: 12 }));

    const { renderPdfPage } = await import('../src/utils/PdfRenderer.js');
    const result = await renderPdfPage('/fake/doc.pdf', 1);

    expect(result).toEqual({ text: 'Page one content', image_path: '/tmp/page1.png', total_pages: 12 });
  });

  it('returns null when the script reports an error', async () => {
    mockExecOnce(JSON.stringify({ error: 'page out of range' }));

    const { renderPdfPage } = await import('../src/utils/PdfRenderer.js');
    const result = await renderPdfPage('/fake/doc.pdf', 999);

    expect(result).toBeNull();
  });

  it('returns null when the subprocess invocation itself fails', async () => {
    execMock.mockImplementationOnce((_cmd: string, cb: (err: Error | null, result?: any) => void) => {
      cb(new Error('spawn failed'));
    });

    const { renderPdfPage } = await import('../src/utils/PdfRenderer.js');
    const result = await renderPdfPage('/fake/doc.pdf', 1);

    expect(result).toBeNull();
  });

  it('defaults total_pages to 1 when the script omits it', async () => {
    mockExecOnce(JSON.stringify({ text: 'some text', image_path: null }));

    const { renderPdfPage } = await import('../src/utils/PdfRenderer.js');
    const result = await renderPdfPage('/fake/doc.pdf', 1);

    expect(result?.total_pages).toBe(1);
  });
});
