import type { DevToolsClient } from './DevToolsClient.js';

/**
 * Centralizes the ```json fence + double-JSON.parse unwrap that was duplicated,
 * each wrapped in an empty catch {}, across browser-action.ts:186-194, :323-334
 * and 9 smoke scripts (fetch_player_id_heatmap_api_test.ts:79-85 etc).
 */
export interface ParsedDevToolsResult {
    text: string;
    json: any | null;
    ok: boolean;
    error?: string;
}

export function parseDevToolsResult(raw: any): ParsedDevToolsResult {
    const text: string = raw?.content?.find((c: any) => c?.type === 'text')?.text ?? raw?.content?.[0]?.text ?? '';

    if (!text) {
        return { text: '', json: null, ok: false, error: 'Empty tool response' };
    }

    // Prefer the structured envelope written by evaluateStructured().
    const bt = tryParseBtEnvelope(text);
    if (bt) return bt;

    // Fall back to a generic ```json fenced block or bare JSON.
    const fenced = text.match(/```json\n([\s\S]*?)\n```/);
    const candidate = fenced ? fenced[1] : text.trim();
    try {
        let parsed = JSON.parse(candidate);
        if (typeof parsed === 'string') {
            // Some responses are double-encoded (a JSON string containing JSON).
            try { parsed = JSON.parse(parsed); } catch { /* leave as string */ }
        }
        return { text, json: parsed, ok: true };
    } catch (err: any) {
        return { text, json: null, ok: false, error: err?.message || String(err) };
    }
}

function tryParseBtEnvelope(text: string): ParsedDevToolsResult | null {
    const fenced = text.match(/```json\n([\s\S]*?)\n```/);
    const candidate = fenced ? fenced[1] : text.trim();
    try {
        let parsed = JSON.parse(candidate);
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch { return null; }
        }
        if (parsed && typeof parsed === 'object' && parsed.__bt === 1) {
            if (parsed.ok) {
                return { text, json: parsed.data ?? null, ok: true };
            }
            return { text, json: null, ok: false, error: parsed.error || 'Page function threw' };
        }
    } catch {
        // not our envelope — let the caller fall through to generic parsing
    }
    return null;
}

/**
 * Wraps a page function so in-page throws surface as typed errors instead of the
 * empty `catch {}` swallowing at browser-action.ts:194/:387/:490/:548/:577, and so
 * values are passed via `args` rather than string-interpolated into the JS source
 * (the systematic_debug_all_tabs_stats.ts:88 injection pattern this replaces).
 */
export async function evaluateStructured<T = any>(
    client: DevToolsClient,
    fnSource: string,
    args?: Record<string, any>
): Promise<ParsedDevToolsResult> {
    const wrapped = `(ARGS) => {
        const USERFN = (${fnSource});
        try {
            const data = USERFN(ARGS);
            return JSON.stringify({ __bt: 1, ok: true, data });
        } catch (e) {
            return JSON.stringify({ __bt: 1, ok: false, error: String((e && e.message) || e) });
        }
    }`;

    const raw = await client.callTool({
        name: 'evaluate_script',
        arguments: { function: wrapped, args: args ? [args] : [{}] },
    });

    return parseDevToolsResult(raw);
}

export interface RetryOptions {
    attempts?: number;
    backoffMs?: number[];
    retryOn?: (err: any) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
    const attempts = opts.attempts ?? 3;
    const backoff = opts.backoffMs ?? [250, 1000, 3000];
    const retryOn = opts.retryOn ?? (() => true);

    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (i === attempts - 1 || !retryOn(err)) break;
            await new Promise(r => setTimeout(r, backoff[Math.min(i, backoff.length - 1)]));
        }
    }
    throw lastErr;
}
