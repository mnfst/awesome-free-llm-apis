/**
 * NetworkStateTracker & ContextSanitizer
 * 
 * Provides background network request and cookie delta awareness while enforcing
 * strict context bloat defense (surgically truncating long strings, JWTs, and large JSON payloads).
 */

export interface NetworkSummaryEntry {
    url: string;
    method: string;
    resourceType: string;
    status: number;
    summary: string;
}

export interface CookieDeltaEntry {
    name: string;
    valuePreview: string;
    domain?: string;
    changed: boolean;
}

export class ContextSanitizer {
    /**
     * Truncates long string values (e.g., cookies, tokens, base64) to prevent context bloat.
     */
    static sanitizeString(val: string, maxLen: number = 20): string {
        if (!val) return '';
        if (val.length <= maxLen) return val;
        return `${val.slice(0, 15)}...[len:${val.length}]`;
    }

    /**
     * Surgically summarizes background JSON network responses into compact metadata descriptions.
     * Prevents multi-kilobyte raw JSON blobs from polluting LLM context windows.
     */
    static summarizeNetworkJsonPayload(url: string, rawJsonText: string): string {
        if (!rawJsonText || rawJsonText.trim().length === 0) return 'Empty payload';
        try {
            const parsed = JSON.parse(rawJsonText);
            if (Array.isArray(parsed)) {
                return `JSON Array [${parsed.length} items] (Sample keys: ${Object.keys(parsed[0] || {}).slice(0, 5).join(', ')})`;
            }
            if (typeof parsed === 'object' && parsed !== null) {
                const keys = Object.keys(parsed).slice(0, 6);
                return `JSON Object { ${keys.join(', ')} } (size: ${rawJsonText.length} chars)`;
            }
        } catch {
            // Non-JSON or plain text snippet
        }
        return `Payload (${rawJsonText.length} chars preview: ${rawJsonText.slice(0, 40).replace(/\n/g, ' ')}...)`;
    }
}

export class NetworkStateTracker {
    private previousCookies: Map<string, string> = new Map();

    /**
     * Computes surgical cookie deltas between browser actions.
     * Only reports cookies that were added, removed, or modified.
     */
    computeCookieDeltas(currentCookies: Array<{ name: string; value: string; domain?: string }>): CookieDeltaEntry[] {
        const deltas: CookieDeltaEntry[] = [];
        const currentMap = new Map<string, string>();

        for (const c of currentCookies) {
            currentMap.set(c.name, c.value);
            const prevVal = this.previousCookies.get(c.name);

            if (prevVal === undefined) {
                // New cookie added
                deltas.push({
                    name: c.name,
                    valuePreview: ContextSanitizer.sanitizeString(c.value),
                    domain: c.domain,
                    changed: true
                });
            } else if (prevVal !== c.value) {
                // Cookie modified
                deltas.push({
                    name: c.name,
                    valuePreview: ContextSanitizer.sanitizeString(c.value),
                    domain: c.domain,
                    changed: true
                });
            }
        }

        // Update stored previous cookies
        this.previousCookies = currentMap;
        return deltas;
    }

    /**
     * Filters background network requests down to surgical, high-relevance XHR/Fetch endpoints.
     */
    summarizeNetworkRequests(requests: Array<{ url: string; method?: string; resourceType?: string; status?: number; responseBody?: string }>): NetworkSummaryEntry[] {
        if (!requests || requests.length === 0) return [];

        const summaries: NetworkSummaryEntry[] = [];
        for (const req of requests.slice(0, 10)) {
            const url = req.url || '';
            // Only capture XHR/Fetch API endpoints
            if (url.includes('/api/') || url.includes('/graphql') || url.includes('/v1/') || url.includes('/v2/') || url.includes('/event/')) {
                summaries.push({
                    url: ContextSanitizer.sanitizeString(url, 60),
                    method: req.method || 'GET',
                    resourceType: req.resourceType || 'fetch',
                    status: req.status || 200,
                    summary: ContextSanitizer.summarizeNetworkJsonPayload(url, req.responseBody || '')
                });
            }
        }

        return summaries;
    }
}
