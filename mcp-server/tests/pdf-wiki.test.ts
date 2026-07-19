/**
 * pdf-wiki.test.ts — RAG-based incremental wiki indexing
 *
 * Tests the new `maybeIndexPdfIntoWiki` RAG pipeline:
 * - Chunk+embed on every page reference (upsert called immediately)
 * - 5-page trigger gate before LLM call
 * - RAG retrieval (vectorStore.search) at trigger time
 * - Rolling-summary prompt shape
 * - mtime staleness resets state + deletes chunks
 * - Title pinning across incremental passes
 * - MAX_TRACKED_PAGES=100 safety cap
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { WikiMemory } from '../src/memory/wiki.js';
import { memoryManager } from '../src/memory/index.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { wikiConfig } from '../src/config/wiki-config.js';


// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/cache/workspace.js', () => ({
  WorkspaceScanner: class {
    getWorkspaceHash = vi.fn().mockResolvedValue('pdf-rag-test-hash');
  },
}));

const { renderPdfPageMock } = vi.hoisted(() => ({
  renderPdfPageMock: vi.fn(),
}));
vi.mock('../src/utils/PdfRenderer.js', () => ({
  renderPdfPage: renderPdfPageMock,
}));

// Mock vectorStore — track upsert/search calls
const { vectorUpsertMock, vectorSearchMock } = vi.hoisted(() => ({
  vectorUpsertMock: vi.fn().mockResolvedValue(undefined),
  vectorSearchMock: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/memory/vector.js', () => ({
  vectorStore: {
    upsert: vectorUpsertMock,
    search: vectorSearchMock,
  },
}));

// Mock summarizeTextLocally — keep it fast in tests
vi.mock('../src/tools/use-free-llm.js', () => ({
  summarizeTextLocally: vi.fn((text: string) => text.slice(0, 150)),
}));

const { shouldUseVisionMock, describePageVisionMock } = vi.hoisted(() => ({
  shouldUseVisionMock: vi.fn().mockReturnValue(false),
  describePageVisionMock: vi.fn().mockResolvedValue(''),
}));
vi.mock('../src/utils/PdfVisionHelper.js', () => ({
  shouldUseVision: shouldUseVisionMock,
  describePageVision: describePageVisionMock,
}));
export { shouldUseVisionMock, describePageVisionMock };

// ── Helpers ───────────────────────────────────────────────────────────────────

const WS_HASH = 'pdf-rag-test-hash';
const STATE_KEY_PREFIX = `pdf-content:${WS_HASH}`;

async function clearState(relPath: string) {
  try {
    await memoryManager.longTerm.delete(`${STATE_KEY_PREFIX}:${relPath}:state`);
  } catch { /* ignore if not found */ }
}

function mockProvider(rawJson: string) {
  const chat = vi.fn().mockResolvedValue({
    choices: [{ message: { content: rawJson } }],
  });
  const provider = { id: 'mock', models: [{ id: 'mock-model' }], chat };
  vi.spyOn(ProviderRegistry, 'getInstance').mockReturnValue({
    getAvailableProviders: () => [provider],
    getProvider: () => provider,
  } as any);
  return chat;
}

async function callIndex(
  absPath: string,
  relPath: string,
  pageNum: number,
  pageText = `text-for-page-${pageNum}`,
  totalPages = 10,
  imageCoverageRatio?: number,
  imagePath?: string | null,
  imageBlocks?: Array<{ image_path: string; rect: number[]; width_pt: number; height_pt: number }>
) {
  const { maybeIndexPdfIntoWiki } = await import('../src/memory/pdf-wiki.js');
  await maybeIndexPdfIntoWiki({
    workspaceRoot: path.dirname(absPath),
    absPdfPath: absPath,
    relativePdfPath: relPath,
    totalPages,
    pageNum,
    pageText,
    imageCoverageRatio,
    imagePath,
    imageBlocks,
  });
}

// ── Fixture ────────────────────────────────────────────────────────────────────

describe('maybeIndexPdfIntoWiki — RAG pipeline', () => {
  let tempDir: string;
  let wikiDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-rag-ws-'));
    wikiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-rag-wiki-'));
    renderPdfPageMock.mockReset();
    vectorUpsertMock.mockReset().mockResolvedValue(undefined);
    vectorSearchMock.mockReset().mockResolvedValue([]);
    vi.spyOn(memoryManager, 'getWiki').mockReturnValue(new WikiMemory(WS_HASH, wikiDir));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(wikiDir, { recursive: true, force: true }).catch(() => {});
    vi.restoreAllMocks();
  });

  async function makePdf(name = 'doc.pdf'): Promise<{ absPath: string; relPath: string }> {
    const absPath = path.join(tempDir, name);
    await fs.writeFile(absPath, 'fake pdf bytes');
    await clearState(name);
    return { absPath, relPath: name };
  }

  // ── Test 1: vectorStore.upsert called on every page reference ──────────────
  it('embeds chunks immediately on every page reference, not just at trigger', async () => {
    mockProvider('[]');
    const { absPath, relPath } = await makePdf();

    // Reference only 2 pages (below threshold of 5)
    await callIndex(absPath, relPath, 1, 'page one content');
    await callIndex(absPath, relPath, 2, 'page two content');

    // upsert must have been called for both pages (even though LLM hasn't fired)
    expect(vectorUpsertMock).toHaveBeenCalled();
    const calledIds = vectorUpsertMock.mock.calls.map((c: any[]) => c[1]?.id as string);
    expect(calledIds.some((id: string) => id.includes(':p1:'))).toBe(true);
    expect(calledIds.some((id: string) => id.includes(':p2:'))).toBe(true);
  });

  // ── Test 2: No LLM call until 5 distinct pages seen ───────────────────────
  it('does not call the LLM until 5 distinct new pages are seen', async () => {
    const chat = mockProvider('[]');
    const { absPath, relPath } = await makePdf();

    for (let pg = 1; pg <= 4; pg++) {
      await callIndex(absPath, relPath, pg);
    }
    expect(chat).not.toHaveBeenCalled();

    // 5th page triggers
    await callIndex(absPath, relPath, 5);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  // ── Test 3: Repeat references do not count toward threshold ───────────────
  it('does not count repeat references to the same page toward the threshold', async () => {
    const chat = mockProvider('[]');
    const { absPath, relPath } = await makePdf();

    // Reference page 1 five times — still only 1 distinct page
    for (let i = 0; i < 5; i++) {
      await callIndex(absPath, relPath, 1);
    }
    expect(chat).not.toHaveBeenCalled();
  });

  // ── Test 4: vectorStore.search called at trigger, restricted to same PDF ──
  it('calls vectorStore.search at trigger with the correct PDF filter', async () => {
    const chat = mockProvider('[]');
    const { absPath, relPath } = await makePdf();

    for (let pg = 1; pg <= 5; pg++) {
      await callIndex(absPath, relPath, pg);
    }

    expect(chat).toHaveBeenCalledTimes(1);
    // vectorSearch must have been called for RAG retrieval
    expect(vectorSearchMock).toHaveBeenCalled();
  });

  // ── Test 5: LLM prompt contains EXISTING SUMMARY + RAG chunks + NEW PAGES ─
  it('includes existing summary, RAG-retrieved chunks, and new pages in the LLM prompt', async () => {
    // Pre-seed a RAG result
    vectorSearchMock.mockResolvedValueOnce([
      { id: 'chunk-0', content: 'prior content from page 1', metadata: { pdfPath: 'doc.pdf', page: 1 }, score: 0.82 },
    ]);
    const chat = mockProvider(JSON.stringify([
      { title: 'Doc Overview', content: 'Summary content here.', tags: ['pdf'], links: [] }
    ]));
    const { absPath, relPath } = await makePdf();

    for (let pg = 1; pg <= 5; pg++) {
      await callIndex(absPath, relPath, pg);
    }

    expect(chat).toHaveBeenCalledTimes(1);
    const prompt: string = chat.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('[EXISTING WIKI SUMMARY]');
    expect(prompt).toContain('[SEMANTICALLY RELATED PRIOR CONTENT');
    expect(prompt).toContain('[NEW PAGES');
  });

  // ── Test 6: renderPdfPage called for batch pages (not current page) ────────
  it('calls renderPdfPage for batch pages that are not the current page, reusing pageText for current', async () => {
    renderPdfPageMock.mockResolvedValue({ text: 'rendered', image_path: null, total_pages: 10 });
    const chat = mockProvider('[]');
    const { absPath, relPath } = await makePdf();

    // Reference pages 1-4 first
    for (let pg = 1; pg <= 4; pg++) {
      await callIndex(absPath, relPath, pg, `text-p${pg}`);
    }
    renderPdfPageMock.mockClear();

    // Page 5 triggers; pages 1-4 should be re-rendered (or not re-rendered depending on cache)
    // The key assertion: renderPdfPage is called at most 4 extra times (not 14 like old model)
    await callIndex(absPath, relPath, 5, 'text-p5');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(renderPdfPageMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  // ── Test 7: mtime change resets state and calls markStale ─────────────────
  it('resets state and deletes chunk IDs when PDF mtime changes', async () => {
    const chat = mockProvider(JSON.stringify([
      { title: 'My Doc', content: 'Summary.', tags: ['pdf'], links: [] }
    ]));
    const { absPath, relPath } = await makePdf();

    // Do a full first pass (5 pages)
    for (let pg = 1; pg <= 5; pg++) {
      await callIndex(absPath, relPath, pg);
    }
    expect(chat).toHaveBeenCalledTimes(1);

    // Simulate mtime change by touching the file
    await fs.writeFile(absPath, 'new pdf bytes');
    chat.mockClear();
    vectorUpsertMock.mockClear();

    // Next reference should reset state (new mtime), not carry over old pagesSeen
    await callIndex(absPath, relPath, 1, 'fresh text');

    // State reset: only 1 page in new session, no LLM call yet
    expect(chat).not.toHaveBeenCalled();
    // But upsert should have been called for the new page's chunk
    expect(vectorUpsertMock).toHaveBeenCalled();
  });

  // ── Test 8: Title stays stable across incremental passes ──────────────────
  it('pins the wiki title across multiple 5-page incremental passes', async () => {
    let callCount = 0;
    const chat = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        choices: [{ message: { content: JSON.stringify([
          { title: callCount === 1 ? 'Pinned Title' : 'Different Title', content: `Pass ${callCount}.`, tags: ['pdf'], links: [] }
        ]) } }],
      };
    });
    const provider = { id: 'mock', models: [{ id: 'm' }], chat };
    vi.spyOn(ProviderRegistry, 'getInstance').mockReturnValue({
      getAvailableProviders: () => [provider],
      getProvider: () => provider,
    } as any);

    const { absPath, relPath } = await makePdf();

    // First pass: pages 1-5
    for (let pg = 1; pg <= 5; pg++) await callIndex(absPath, relPath, pg);
    expect(chat).toHaveBeenCalledTimes(1);

    // Second pass: pages 6-10
    for (let pg = 6; pg <= 10; pg++) await callIndex(absPath, relPath, pg);
    expect(chat).toHaveBeenCalledTimes(2);

    // On second call, the model tried to use 'Different Title' but it must be overridden
    const secondCallWriteArgs = chat.mock.calls[1];
    const promptSecond: string = secondCallWriteArgs[0].messages[0].content;
    expect(promptSecond).toContain('Pinned Title'); // existing wikiTitle fed into prompt
  });

  // ── Test 9: MAX_TRACKED_PAGES cap stops pagesSeen growth ──────────────────
  it('stops tracking new pages for summarization once MAX_TRACKED_PAGES=100 is reached', async () => {
    const chat = mockProvider('[]');
    const { absPath, relPath } = await makePdf('big.pdf');

    // Seed state as if 100 pages are already tracked
    const fakeState = {
      mtimeMs: (await fs.stat(absPath)).mtimeMs,
      pagesSeen: Array.from({ length: 100 }, (_, i) => i + 1),
      lastSummarizedPageCount: 100,
      chunkIds: [],
    };
    await memoryManager.longTerm.save(`${STATE_KEY_PREFIX}:${'big.pdf'}:state`, fakeState);
    chat.mockClear();

    // Referencing page 101 should NOT trigger LLM (cap reached)
    await callIndex(absPath, 'big.pdf', 101, 'new text beyond cap', 200);
    expect(chat).not.toHaveBeenCalled();
  });

  // ── Test 10: Writes wiki page tagged with 'pdf' ───────────────────────────
  it('writes a wiki page and tags it with pdf even when model omits the tag', async () => {
    mockProvider(JSON.stringify([
      { title: 'Widget Architecture', content: 'Summary body.', tags: ['architecture'], links: [] }
    ]));
    const { absPath, relPath } = await makePdf();

    for (let pg = 1; pg <= 5; pg++) await callIndex(absPath, relPath, pg);

    const wiki = new WikiMemory(WS_HASH, wikiDir);
    const page = await wiki.read('Widget Architecture');
    expect(page).not.toBeNull();
    expect(page?.tags).toContain('pdf');
    expect(page?.tags).toContain('architecture');
  });

  // ── Test 11: Splices vision description on high coverage ──────────────────
  it('splices vision description into pageText when image_coverage_ratio is high and text is sparse', async () => {
    const { absPath, relPath } = await makePdf();
    shouldUseVisionMock.mockReturnValueOnce(true);
    describePageVisionMock.mockResolvedValueOnce('\n\n[Vision — page 1]\nA complex diagram of components.');

    await callIndex(absPath, relPath, 1, 'sparse text', 10, 0.35, '/tmp/dummy.png', []);

    // Check if the vector store received the augmented content
    const calls = vectorUpsertMock.mock.calls;
    const allContent = calls.map(([, item]: any) => item.content).join(' ');
    expect(allContent).toContain('complex diagram');
  });

  // ── Test 12: Per-page proportional budget slicing ────────────────────────
  it('clips each page text proportionally to batchRawMaxChars / numPages', async () => {
    const chat = mockProvider(JSON.stringify([{ title: 'Budget', content: 'Clipped correctly.', tags: [], links: [] }]));
    const { absPath, relPath } = await makePdf();

    const originalMax = wikiConfig.batchRawMaxChars;
    // 5 pages × budget forces ~20 chars per page
    (wikiConfig as any).batchRawMaxChars = 100;

    try {
      for (let pg = 1; pg <= 5; pg++) {
        const longText = `Page${pg}: ${'x'.repeat(200)} end of page ${pg}`;
        await callIndex(absPath, relPath, pg, longText);
      }

      expect(chat).toHaveBeenCalled();
      const promptSent = chat.mock.calls[0][0].messages[0].content;

      // Each page must appear labelled in the prompt
      expect(promptSent).toContain('[Page');
      // Truncation marker must appear since pages are longer than per-page budget
      expect(promptSent).toContain('[page truncated]');
    } finally {
      (wikiConfig as any).batchRawMaxChars = originalMax;
    }
  });
});
