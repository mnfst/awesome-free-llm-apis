import { countStringTokens } from '../utils/tiktoken.js';

/**
 * Single source of truth for every truncation/cap magic-number that used to be
 * scattered across browser-action.ts and NetworkStateTracker.ts. All values are
 * env-overridable so a deployment can widen/narrow context usage without a code change.
 *
 * These are CAPS, not targets — callers should filter by relevance first
 * (e.g. SemanticDomCompressor picking structurally interesting lines) and only
 * then trim to the budget here.
 */
export const browserBudget = {
    snapshotTokens: envInt('BROWSER_SNAPSHOT_TOKENS', 3000),
    extractionTokens: envInt('BROWSER_EXTRACTION_TOKENS', 4000),
    networkTokens: envInt('BROWSER_NETWORK_TOKENS', 2000),
    nodeCandidates: envInt('BROWSER_NODE_CANDIDATES', 40),
    llmBatchItems: envInt('BROWSER_LLM_BATCH_ITEMS', 60),
    endpointCandidates: envInt('BROWSER_ENDPOINT_CANDIDATES', 25),
    bodyPreviewChars: envInt('BROWSER_BODY_PREVIEW_CHARS', 400),
    maxBodyBytes: envInt('BROWSER_MAX_BODY_BYTES', 262144),
} as const;

function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Trims `text` to fit within `maxTokens` using the shared tiktoken encoder,
 * counting instead of guessing at a character-length proxy. Trims from the
 * end (line-oriented) so structural summaries stay intact from the top.
 */
export function fitToTokenBudget(text: string, maxTokens: number): string {
    if (!text) return text;
    if (countStringTokens(text) <= maxTokens) return text;

    const lines = text.split('\n');
    let lo = 0;
    let hi = lines.length;
    // Binary search the largest prefix of lines that fits the budget.
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = lines.slice(0, mid).join('\n');
        if (countStringTokens(candidate) <= maxTokens) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    const kept = lines.slice(0, lo).join('\n');
    return kept + (lo < lines.length ? `\n…[truncated ${lines.length - lo} more lines to fit budget]` : '');
}
