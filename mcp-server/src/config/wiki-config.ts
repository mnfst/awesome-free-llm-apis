/**
 * Central config for all wiki/pdf-wiki token and size limits.
 * Override via environment variables for larger model contexts.
 *
 * WIKI_MODEL_CONTEXT_K  - kilobytes of model context window (default: 8)
 * WIKI_MAX_PAGES        - max wiki pages before eviction (default: 500)
 * WIKI_MAX_TOKENS       - max_tokens for LLM wiki/pdf calls (default: 2000)
 * WIKI_DIFF_CHARS       - max chars of diff summary fed to LLM (default: 4000)
 * WIKI_CANDIDATES       - max candidate wiki pages per search (default: 15)
 * WIKI_KEYWORDS         - max keywords extracted for candidate search (default: 8)
 * PDF_BATCH_THRESHOLD   - pages to accumulate before triggering LLM (default: 5)
 * PDF_CHUNK_SIZE        - chars per vector chunk (default: 600)
 * PDF_CHUNK_OVERLAP     - overlap between chunks (default: 120)
 * PDF_RAG_TOP_K         - base top-k chunks retrieved per RAG pass (default: 8); scales up with
 *                         document chunk count, capped by PDF_RAG_TOP_K_CEILING
 * PDF_RAG_TOP_K_CEILING - max top-k a large document's RAG pass can scale to (default: 40)
 * PDF_MAX_PAGES         - safety-valve ceiling on pages tracked per document (default: 100000,
 *                         effectively unbounded — chunk embedding is already uncapped, so this
 *                         only guards against pathological cases; hitting it logs a warning
 *                         rather than silently dropping summarization coverage)
 * PDF_RAG_QUERY_CHARS   - chars of batch text used to build RAG query (default: 400)
 */

const contextK = parseInt(process.env.WIKI_MODEL_CONTEXT_K ?? '8', 10);

export const wikiConfig = {
  // --- Storage limits ---
  maxPageSizeBytes:      contextK * 1024,           // default 8192
  maxPageBodyBytes:      contextK * 1024 - 500,     // leave 500B for frontmatter
  maxWikiPages:          parseInt(process.env.WIKI_MAX_PAGES       ?? '500',  10),

  // --- LLM call budget ---
  maxTokensLlmResponse:  parseInt(process.env.WIKI_MAX_TOKENS      ?? '2000', 10),

  // --- Prompt construction caps ---
  maxDiffSummaryChars:   parseInt(process.env.WIKI_DIFF_CHARS      ?? '4000', 10),
  maxCandidatePages:     parseInt(process.env.WIKI_CANDIDATES      ?? '15',   10),
  maxCandidateKeywords:  parseInt(process.env.WIKI_KEYWORDS        ?? '8',    10),

  // --- PDF-wiki RAG pipeline ---
  pageBatchThreshold:    parseInt(process.env.PDF_BATCH_THRESHOLD  ?? '5',    10),
  chunkSize:             parseInt(process.env.PDF_CHUNK_SIZE       ?? '600',  10),
  chunkOverlap:          parseInt(process.env.PDF_CHUNK_OVERLAP    ?? '120',  10),
  ragTopK:               parseInt(process.env.PDF_RAG_TOP_K        ?? '8',    10),
  ragTopKCeiling:        parseInt(process.env.PDF_RAG_TOP_K_CEILING ?? '40',  10),
  maxTrackedPages:       parseInt(process.env.PDF_MAX_PAGES        ?? '100000', 10),
  ragQuerySumChars:      parseInt(process.env.PDF_RAG_QUERY_CHARS  ?? '400',  10),
  batchRawMaxChars:      contextK * 512,             // half context for batch text
} as const;
