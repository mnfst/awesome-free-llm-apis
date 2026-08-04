/**
 * Solves W8: fetch_player_id_heatmap_api_test.ts:30 hardcoded a player id
 * ('77726'; // Josué) because there was no way to discover ids from the page
 * itself. This tokenizes observed URLs into templates and mines candidate id
 * values from OTHER observed traffic and the live DOM/page-url — never a
 * constant.
 */
export interface EndpointTemplate {
    template: string; // e.g. https://api.sofascore.com/api/v1/event/{id1}/player/{id2}/statistics
    method: string;
    idSlots: number;
    examples: string[];
}

const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class EndpointTemplater {
    static tokenize(urls: string[], method = 'GET'): EndpointTemplate[] {
        const byTemplate = new Map<string, EndpointTemplate>();

        for (const url of urls) {
            let idx = 0;
            let template: string;
            try {
                const u = new URL(url);
                const parts = u.pathname.split('/').map(seg => {
                    if (ID_SEGMENT.test(seg)) {
                        idx++;
                        return `{id${idx}}`;
                    }
                    return seg;
                });
                template = `${u.origin}${parts.join('/')}`;
            } catch {
                continue;
            }

            const existing = byTemplate.get(template);
            if (existing) {
                if (existing.examples.length < 5) existing.examples.push(url);
            } else {
                byTemplate.set(template, { template, method, idSlots: idx, examples: [url] });
            }
        }

        return Array.from(byTemplate.values());
    }

    /** Extracts numeric/uuid id candidates from other observed bodies, the page url, and data-id attrs already scraped into `domIds`. */
    static mineIdCandidates(sources: { bodies?: string[]; pageUrl?: string; domIds?: string[] }): string[] {
        const ids = new Set<string>();

        for (const body of sources.bodies ?? []) {
            const matches = body.match(/"id"\s*:\s*(\d+)/g) || [];
            for (const m of matches) {
                const val = m.match(/(\d+)/)?.[1];
                if (val) ids.add(val);
            }
        }

        if (sources.pageUrl) {
            const fragMatches = sources.pageUrl.match(/(\d{4,})/g) || [];
            for (const v of fragMatches) ids.add(v);
        }

        for (const id of sources.domIds ?? []) {
            if (/^\d+$/.test(id)) ids.add(id);
        }

        return Array.from(ids);
    }

    /** Expands a template against known ids as a capped cross-product. */
    static expand(template: EndpointTemplate, ids: string[], maxCalls = 25): string[] {
        if (template.idSlots === 0) return [template.template];
        if (ids.length === 0) return [];

        const urls: string[] = [];
        for (const id of ids) {
            if (urls.length >= maxCalls) break;
            let url = template.template;
            for (let i = 1; i <= template.idSlots; i++) {
                url = url.replace(`{id${i}}`, id);
            }
            urls.push(url);
        }
        return urls;
    }
}
