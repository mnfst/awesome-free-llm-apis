import type { CapturedRequest } from './BrowserSession.js';

const ANALYTICS_HOST_HINTS = ['google-analytics', 'doubleclick', 'segment.io', 'sentry.io', 'hotjar', 'facebook.com/tr', 'analytics'];

export interface RankedEndpoint {
    url: string;
    method: string;
    score: number;
    reasons: string[];
    sample?: string;
}

/**
 * Scores captured network requests so the highest-value private-API endpoints
 * (SofaScore's /statistics, /heatmap, /shotmap, /passmap) surface first without
 * a human having to eyeball a raw request list. Deterministic — no LLM call
 * required, so it also serves as the fallback when the LLM selection step fails.
 */
export class EndpointRanker {
    static rank(requests: CapturedRequest[], contextIds: string[] = []): RankedEndpoint[] {
        const scored = requests.map(req => {
            let score = 0;
            const reasons: string[] = [];

            if (/json/i.test(req.contentType)) { score += 3; reasons.push('json content-type'); }
            if (req.status >= 200 && req.status < 300) { score += 2; reasons.push('2xx status'); }

            let shapeRich = false;
            if (req.body) {
                try {
                    const parsed = JSON.parse(req.body);
                    if (Array.isArray(parsed) && parsed.length > 0) shapeRich = true;
                    else if (parsed && typeof parsed === 'object' && Object.keys(parsed).length >= 3) shapeRich = true;
                } catch { /* not JSON, or truncated */ }
            }
            if (shapeRich) { score += 2; reasons.push('array/rich-object body'); }

            if (contextIds.some(id => id && req.url.includes(id))) { score += 2; reasons.push('url contains a known context id'); }

            if (ANALYTICS_HOST_HINTS.some(h => req.url.includes(h))) { score -= 3; reasons.push('analytics/telemetry host'); }
            if (req.bytes < 100) { score -= 2; reasons.push('tiny body'); }

            return { url: req.url, method: req.method, score, reasons, sample: req.body?.slice(0, 200) };
        });

        return scored.sort((a, b) => b.score - a.score);
    }

    static topK(requests: CapturedRequest[], k: number, contextIds: string[] = []): RankedEndpoint[] {
        return this.rank(requests, contextIds).slice(0, k);
    }
}
