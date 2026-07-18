import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProviderRegistry } from '../providers/registry.js';
import { renderPdfPage } from '../utils/PdfRenderer.js';
import { memoryManager } from './index.js';
import { parseAndValidateDecisions } from './wiki-maintainer.js';
import type { WikiPage } from './wiki.js';
import { vectorStore } from './vector.js';
import { summarizeTextLocally } from '../tools/use-free-llm.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_BATCH_THRESHOLD = 5;   // trigger LLM pass every N new distinct pages
const MAX_TRACKED_PAGES = 100;    // safety cap — stop growing beyond this
const CHUNK_SIZE = 400;           // characters per vector chunk
const CHUNK_OVERLAP = 100;        // overlap stride between chunks
const RAG_TOP_K = 8;              // semantic chunks retrieved per pass
const MAX_CANDIDATE_PAGES = 15;

// ─── State shape ─────────────────────────────────────────────────────────────
interface PdfWikiState {
  mtimeMs: number;
  pagesSeen: number[];          // distinct page numbers referenced so far, sorted
  lastSummarizedPageCount: number;
  wikiTitle?: string;           // pinned after first successful write
  chunkIds: string[];           // vector-store IDs for all embedded chunks
}

function stateKeyFor(wsHash: string, relativePdfPath: string): string {
  return `pdf-content:${wsHash}:${relativePdfPath}:state`;
}

// ─── Chunk helper ─────────────────────────────────────────────────────────────
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
    if (start + overlap >= text.length) break;
  }
  if (chunks.length === 0 && text.trim()) chunks.push(text);
  return chunks;
}

// ─── Candidate wiki pages ─────────────────────────────────────────────────────
async function findCandidatePages(
  wiki: { search: (q: string, persona?: string) => Promise<WikiPage[]> },
  pdfBasename: string
): Promise<WikiPage[]> {
  const keywords = pdfBasename
    .replace(/\.pdf$/i, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(k => k.length > 2);

  const seen = new Map<string, WikiPage>();
  for (const keyword of keywords) {
    const results = await wiki.search(keyword, 'researcher');
    for (const page of results) {
      if (!seen.has(page.title)) seen.set(page.title, page);
    }
    if (seen.size >= MAX_CANDIDATE_PAGES) break;
  }
  return Array.from(seen.values()).slice(0, MAX_CANDIDATE_PAGES);
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * RAG-based incremental PDF wiki indexing.
 * Called fire-and-forget from resolvePdfRef on every pdf:// reference.
 * Chunks & embeds the newly rendered page immediately.
 * Every PAGE_BATCH_THRESHOLD new distinct pages, runs a semantic retrieval
 * pass and feeds retrieved context + new pages into the LLM to update
 * the wiki with genuine cross-page understanding.
 */
export async function maybeIndexPdfIntoWiki(params: {
  workspaceRoot: string;
  absPdfPath: string;
  relativePdfPath: string;
  totalPages: number;
  pageNum: number;
  pageText: string;
}): Promise<void> {
  const { workspaceRoot, absPdfPath, relativePdfPath, totalPages, pageNum, pageText } = params;

  try {
    const { WorkspaceScanner } = await import('../cache/workspace.js');
    const wsHash = await new WorkspaceScanner(workspaceRoot).getWorkspaceHash(workspaceRoot);

    // ── Step 1: State load & staleness check ────────────────────────────────
    const stats = await fs.stat(absPdfPath);
    const cacheKey = stateKeyFor(wsHash, relativePdfPath);
    let state: PdfWikiState = (await memoryManager.longTerm.load(cacheKey)) as PdfWikiState || {
      mtimeMs: 0,
      pagesSeen: [],
      lastSummarizedPageCount: 0,
      chunkIds: [],
    };

    if (state.mtimeMs !== stats.mtimeMs) {
      // PDF changed: mark old wiki page stale and delete embedded chunks
      if (state.wikiTitle) {
        try {
          const wiki = memoryManager.getWiki(wsHash);
          await (wiki as any).markStale?.(state.wikiTitle, 'Source PDF changed on disk.');
        } catch { /* markStale is optional */ }
      }
      // Delete all previously embedded chunks from vector store
      for (const chunkId of (state.chunkIds || [])) {
        try {
          const idx = (vectorStore as any)['getIndex'] ? await (vectorStore as any).getIndex(wsHash) : null;
          if (idx) await idx.deleteItem(chunkId).catch(() => {});
        } catch { /* best-effort */ }
      }
      state = { mtimeMs: stats.mtimeMs, pagesSeen: [], lastSummarizedPageCount: 0, chunkIds: [] };
    }

    // ── Step 2: Chunk & embed the newly rendered page ───────────────────────
    if (!pageText.trim()) {
      await memoryManager.longTerm.save(cacheKey, state);
      return;
    }

    const pdfBasename = path.basename(absPdfPath);
    const chunks = chunkText(pageText, CHUNK_SIZE, CHUNK_OVERLAP);
    const newChunkIds: string[] = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkContent = chunks[ci];
      const chunkId = `pdf:${wsHash}:${relativePdfPath}:p${pageNum}:c${ci}`;
      const contentHash = crypto.createHash('sha256').update(chunkContent).digest('hex');
      try {
        await vectorStore.upsert(wsHash, {
          id: chunkId,
          content: chunkContent,
          metadata: { pdfPath: relativePdfPath, page: pageNum, chunkIndex: ci },
          contentHash,
          timestamp: Date.now(),
        });
        newChunkIds.push(chunkId);
      } catch (err) {
        console.error(`[pdf-wiki] Failed to embed chunk ${chunkId}:`, err);
      }
    }

    // Track this page (deduplicated)
    if (!state.pagesSeen.includes(pageNum) && state.pagesSeen.length < MAX_TRACKED_PAGES) {
      state.pagesSeen.push(pageNum);
      state.pagesSeen.sort((a, b) => a - b);
    }
    state.chunkIds = [...(state.chunkIds || []), ...newChunkIds];

    // ── Step 3: Trigger gate ────────────────────────────────────────────────
    if (state.pagesSeen.length - state.lastSummarizedPageCount < PAGE_BATCH_THRESHOLD) {
      await memoryManager.longTerm.save(cacheKey, state);
      return;
    }

    // ── Step 4: Gather new batch page texts ─────────────────────────────────
    const batchPageNums = state.pagesSeen.slice(state.lastSummarizedPageCount);
    const batchTexts: string[] = [];
    for (const pg of batchPageNums) {
      if (pg === pageNum) {
        batchTexts.push(pageText);
      } else {
        try {
          const rendered = await renderPdfPage(absPdfPath, pg);
          if (rendered?.text) batchTexts.push(rendered.text);
        } catch (err) {
          console.error(`[pdf-wiki] Failed to render batch page ${pg}:`, err);
        }
      }
    }
    const batchRaw = batchTexts.join('\n\n');

    // ── Step 5: Semantic retrieval (RAG) ────────────────────────────────────
    const semanticQuery = summarizeTextLocally(batchRaw, 300);
    let ragChunksBlock = '(no related prior content found)';
    try {
      const retrieved = await vectorStore.search(wsHash, semanticQuery, RAG_TOP_K) as any[];
      // Filter to same PDF only
      const relevant = retrieved.filter(r =>
        r.metadata?.pdfPath === relativePdfPath && !batchPageNums.includes(r.metadata?.page)
      );
      if (relevant.length > 0) {
        ragChunksBlock = relevant
          .map((r, i) => `[Chunk ${i + 1} — page ${r.metadata?.page}, score ${(r as any).score?.toFixed(2) ?? '?'}]\n${r.content}`)
          .join('\n\n');
      }
    } catch (err) {
      console.error('[pdf-wiki] RAG retrieval failed:', err);
    }

    // ── Step 6: Build rolling-summary LLM prompt ────────────────────────────
    const wiki = memoryManager.getWiki(wsHash);
    let existingSummary = '(none — first pass)';
    if (state.wikiTitle) {
      try {
        const existing = await wiki.read(state.wikiTitle);
        if (existing?.content) existingSummary = existing.content;
      } catch { /* first pass */ }
    }

    const candidatePages = await findCandidatePages(wiki, pdfBasename);
    const candidateTitles = new Set(candidatePages.map(p => p.title));
    const candidateBlock = candidatePages.length > 0
      ? candidatePages.map(p => `- "${p.title}" (tags: ${p.tags.join(', ') || 'none'}) — ${p.content.split('\n')[0].slice(0, 100)}`).join('\n')
      : '(no related pages found)';

    const prompt = [
      `You are maintaining a project wiki for the PDF "${pdfBasename}" (${totalPages} pages total).`,
      `Pages seen so far: ${state.pagesSeen.join(', ')}. New batch: pages ${batchPageNums.join(', ')}.`,
      '',
      '## [EXISTING WIKI SUMMARY]',
      existingSummary,
      '',
      '## [SEMANTICALLY RELATED PRIOR CONTENT (RAG-retrieved, ranked by similarity)]',
      ragChunksBlock,
      '',
      `## [NEW PAGES (batch ${state.lastSummarizedPageCount + 1}–${state.pagesSeen.length})]`,
      batchRaw.slice(0, 3500),
      '',
      '## Candidate Existing Wiki Pages (reference by exact title only)',
      candidateBlock,
      '',
      state.wikiTitle
        ? `Task: Update the wiki page. Preserve the title "${state.wikiTitle}" exactly. Integrate new content with the existing summary, using RAG-retrieved excerpts to resolve cross-references. Output: single JSON object {title, content, tags, links} or empty array [] if unsummarisable.`
        : 'Task: Create a wiki page summarizing this document. Return ONLY a JSON array with zero or one element: { "title": "short descriptive title", "content": "wiki page body in markdown, under 3000 characters", "tags": ["pdf", ...], "links": ["<exact title from candidate list>", ...] }. Return [] if unsummarisable.',
    ].join('\n');

    const registry = ProviderRegistry.getInstance();
    const provider = registry.getAvailableProviders().find(p => p.id !== 'siliconflow') || registry.getProvider('gemini');
    if (!provider) return;

    const response = await provider.chat({
      model: provider.models[0]?.id,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const rawText = typeof response.choices?.[0]?.message?.content === 'string'
      ? response.choices[0].message.content
      : '';
    if (!rawText) return;

    // ── Step 7: Parse, title-pin, write ────────────────────────────────────
    // Wrap single-object response in array for parseAndValidateDecisions
    const normalized = rawText.trim().startsWith('{') ? `[${rawText.trim()}]` : rawText;
    const decisions = parseAndValidateDecisions(normalized, candidateTitles);

    for (const decision of decisions) {
      if (state.wikiTitle) decision.title = state.wikiTitle; // pin title
      const tags = decision.tags.includes('pdf') ? decision.tags : [...decision.tags, 'pdf'];
      await wiki.write(decision.title, decision.content, tags, decision.links);
      if (!state.wikiTitle) state.wikiTitle = decision.title; // pin on first write
    }

    // ── Step 8: Persist updated state ───────────────────────────────────────
    state.lastSummarizedPageCount = state.pagesSeen.length;
    await memoryManager.longTerm.save(cacheKey, state);
  } catch (err) {
    console.error('[pdf-wiki] maybeIndexPdfIntoWiki failed:', err);
  }
}
