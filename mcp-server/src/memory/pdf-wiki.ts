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
import { wikiConfig } from '../config/wiki-config.js';
import { shouldUseVision, describePageVision } from '../utils/PdfVisionHelper.js';

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
    if (start + chunkSize >= text.length) {
      break;
    }
    const step = Math.max(1, chunkSize - overlap);
    start += step;
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
    if (seen.size >= wikiConfig.maxCandidatePages) break;
  }
  return Array.from(seen.values()).slice(0, wikiConfig.maxCandidatePages);
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
  imageCoverageRatio?: number;
  imagePath?: string | null;
  imageBlocks?: Array<{ image_path: string; rect: number[]; width_pt: number; height_pt: number }>;
}): Promise<void> {
  const {
    workspaceRoot,
    absPdfPath,
    relativePdfPath,
    totalPages,
    pageNum,
    pageText,
    imageCoverageRatio,
    imagePath,
    imageBlocks
  } = params;

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
          const wiki = memoryManager.getWiki(wsHash, workspaceRoot);
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

    // Fetch rolling document context from the existing wiki page (if any) to guide vision models
    let previousWikiContext = '';
    if (state.wikiTitle) {
      try {
        const wiki = memoryManager.getWiki(wsHash, workspaceRoot);
        const wikiPage = await wiki.read(state.wikiTitle);
        if (wikiPage && wikiPage.content) {
          previousWikiContext = wikiPage.content;
        }
      } catch { /* best effort */ }
    }

    const pdfBasename = path.basename(absPdfPath);
    let effectivePageText = pageText;
    if (imageCoverageRatio !== undefined && imagePath && shouldUseVision(imageCoverageRatio, pageText)) {
      const visionDesc = await describePageVision(imagePath, pdfBasename, pageNum, imageBlocks, pageText, previousWikiContext);
      if (visionDesc) effectivePageText = pageText + visionDesc;
    }

    const chunks = chunkText(effectivePageText, wikiConfig.chunkSize, wikiConfig.chunkOverlap);
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

    // Track this page (deduplicated). maxTrackedPages is a safety valve for pathological
    // cases, not a normal content-loss point — pages beyond it are still embedded above and
    // remain RAG-searchable, but stop contributing to the rolling wiki summary, so make that
    // visible instead of silent.
    if (!state.pagesSeen.includes(pageNum)) {
      if (state.pagesSeen.length < wikiConfig.maxTrackedPages) {
        state.pagesSeen.push(pageNum);
        state.pagesSeen.sort((a, b) => a - b);
      } else {
        console.warn(`[pdf-wiki] "${pdfBasename}" hit maxTrackedPages (${wikiConfig.maxTrackedPages}) — page ${pageNum} is embedded and RAG-searchable but will not be folded into the wiki summary. Raise PDF_MAX_PAGES if this document should be fully summarized.`);
      }
    }
    state.chunkIds = [...(state.chunkIds || []), ...newChunkIds];

    // ── Step 3: Trigger gate ────────────────────────────────────────────────
    if (state.pagesSeen.length - state.lastSummarizedPageCount < wikiConfig.pageBatchThreshold) {
      await memoryManager.longTerm.save(cacheKey, state);
      return;
    }

    // ── Step 4: Gather new batch page texts ─────────────────────────────────
    const batchPageNums = state.pagesSeen.slice(state.lastSummarizedPageCount);
    const batchTexts: string[] = [];
    for (const pg of batchPageNums) {
      if (pg === pageNum) {
        batchTexts.push(effectivePageText);
      } else {
        try {
          const rendered = await renderPdfPage(absPdfPath, pg);
          if (rendered?.text) {
            let pgText = rendered.text;
            if (rendered.image_coverage_ratio && rendered.image_path && shouldUseVision(rendered.image_coverage_ratio, pgText)) {
              const visionDesc = await describePageVision(rendered.image_path, pdfBasename, pg, rendered.image_blocks, pgText, previousWikiContext);
              if (visionDesc) pgText += visionDesc;
            }
            batchTexts.push(pgText);
          }
        } catch (err) {
          console.error(`[pdf-wiki] Failed to render batch page ${pg}:`, err);
        }
      }
    }
    // Per-page proportional budget: divide batchRawMaxChars equally across pages so every
    // page contributes regardless of length (avoids front-loading page 1 and dropping others).
    const batchRaw = batchTexts.length > 0
      ? batchTexts
          .map((pt, i) => {
            const perPageBudget = Math.floor(wikiConfig.batchRawMaxChars / batchTexts.length);
            const clipped = pt.length > perPageBudget ? pt.slice(0, perPageBudget) + '\n... [page truncated]' : pt;
            return `[Page ${batchPageNums[i] ?? i + 1}]\n${clipped}`;
          })
          .join('\n\n')
      : '';

    // ── Step 5: Semantic retrieval (RAG) ────────────────────────────────────
    // Scale retrieval width with how much of the document is actually embedded — a fixed
    // top-k (e.g. 8) that's fine for a 10-page PDF leaves most of a large book's chunks
    // permanently unreachable by any single query. Grows with chunkIds.length, bounded by
    // ragTopKCeiling so a single retrieval pass still stays a sane prompt size.
    const effectiveRagTopK = Math.min(
      wikiConfig.ragTopKCeiling,
      wikiConfig.ragTopK + Math.floor(state.chunkIds.length / 50)
    );
    const semanticQuery = summarizeTextLocally(batchRaw, wikiConfig.ragQuerySumChars);
    let ragChunksBlock = '(no related prior content found)';
    try {
      const retrieved = await vectorStore.search(wsHash, semanticQuery, effectiveRagTopK) as any[];
      // Filter to same PDF only
      const relevant = retrieved.filter(r =>
        r.metadata?.pdfPath === relativePdfPath && !batchPageNums.includes(r.metadata?.page)
      );
      // Beyond pure similarity, prefer chunks near the current batch's pages — cross-page
      // continuity for a book matters more from nearby chapters than from a distant but
      // lexically-similar section.
      const nearestDistance = (page: number) =>
        Math.min(...batchPageNums.map(pg => Math.abs(pg - page)));
      relevant.sort((a, b) => nearestDistance(a.metadata?.page ?? 0) - nearestDistance(b.metadata?.page ?? 0));
      if (relevant.length > 0) {
        ragChunksBlock = relevant
          .map((r, i) => `[Chunk ${i + 1} — page ${r.metadata?.page}, score ${(r as any).score?.toFixed(2) ?? '?'}]\n${r.content}`)
          .join('\n\n');
      }
    } catch (err) {
      console.error('[pdf-wiki] RAG retrieval failed:', err);
    }

    // ── Step 6: Build rolling-summary LLM prompt ────────────────────────────
    const wiki = memoryManager.getWiki(wsHash, workspaceRoot);
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
      batchRaw,
      '',
      '## Candidate Existing Wiki Pages (reference by exact title only)',
      candidateBlock,
      '',
      state.wikiTitle
        // Body-size cap applies to updates too, not just the initial create — without it, a long
        // document's summary can keep growing unbounded across many batches (recency dilution +
        // eventual prompt-size pressure), instead of staying a stable-size distillation.
        ? `Task: Update the wiki page. Preserve the title "${state.wikiTitle}" exactly. Integrate new content with the existing summary, using RAG-retrieved excerpts to resolve cross-references. Keep the merged content under ${wikiConfig.maxPageBodyBytes} characters — condense/prune older material rather than letting it grow unbounded across batches. Output: single JSON object {title, content, tags, links} or empty array [] if unsummarisable.`
        : `Task: Create a wiki page summarizing this document. Return ONLY a JSON array with zero or one element: { "title": "short descriptive title", "content": "wiki page body in markdown, under ${wikiConfig.maxPageBodyBytes} characters", "tags": ["pdf", ...], "links": ["<exact title from candidate list>", ...] }. Return [] if unsummarisable.`,
    ].join('\n');

    const registry = ProviderRegistry.getInstance();
    const provider = registry.getAvailableProviders().find(p => p.id !== 'siliconflow') || registry.getProvider('gemini');
    if (!provider) return;

    // Dynamically calculate output budget based on create/update task, page batch depth, and existing summary retention floor
    const isCreate = !state.wikiTitle;
    const batchBonus = batchPageNums.length * 80;
    const summaryRetentionFloor = Math.ceil(existingSummary.length / 4);
    const baseOutputTokens = isCreate ? 2400 : 1400;
    const dynamicMaxTokens = Math.min(
      wikiConfig.maxTokensLlmResponse,
      Math.max(baseOutputTokens, summaryRetentionFloor + batchBonus)
    );

    const response = await provider.chat({
      model: provider.models[0]?.id,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: dynamicMaxTokens,
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
