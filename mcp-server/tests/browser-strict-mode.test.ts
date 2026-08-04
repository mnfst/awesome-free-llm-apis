import { describe, it, expect, vi } from 'vitest';
import { IntelligentBrowserScraper } from '../src/tools/browser-action.js';

describe('Strict-mode extraction (browser_tool overhaul, W7 de-fabrication)', () => {
    it('reports status:"failed" and an empty record set when the LLM never returns valid JSON — never synthesizes plausible records', async () => {
        const mockLlmCaller = vi.fn().mockResolvedValue('I cannot help with that.');
        const scraper = new IntelligentBrowserScraper(mockLlmCaller);

        const result = await scraper.interpretExtractedDataWithLLM(
            [{ lines: ['Arsenal', '2', '1', 'Chelsea'], href: '/match/123' }],
            'Web Page Data'
        );

        expect(result.status).toBe('failed');
        expect(result.records).toEqual([]);
        expect(result.errors[0].code).toBe('LLM_JSON_PARSE_FAILED');
        // The old fallback fabricated { id, title: lines.join(' | '), link } — assert that shape never appears.
        expect(result.rawSample).toBeDefined();
        expect((result as any).records.some((r: any) => 'title' in r)).toBe(false);
    });

    it('retries once with a corrective instruction before giving up', async () => {
        const mockLlmCaller = vi.fn()
            .mockResolvedValueOnce('not json')
            .mockResolvedValueOnce(JSON.stringify([{ homeTeam: 'Arsenal', awayTeam: 'Chelsea' }]));
        const scraper = new IntelligentBrowserScraper(mockLlmCaller);

        const result = await scraper.interpretExtractedDataWithLLM(
            [{ lines: ['Arsenal', 'Chelsea'], href: '/match/1' }],
            'Web Page Data'
        );

        expect(mockLlmCaller).toHaveBeenCalledTimes(2);
        expect(result.status).toBe('ok');
        expect(result.records[0].homeTeam).toBe('Arsenal');
    });

    it('returns status:"ok" with real records on a clean parse (existing behavior preserved)', async () => {
        const mockLlmCaller = vi.fn().mockResolvedValue(
            JSON.stringify([{ homeTeam: 'Real Madrid', awayTeam: 'Barcelona' }])
        );
        const scraper = new IntelligentBrowserScraper(mockLlmCaller);
        const result = await scraper.interpretExtractedDataWithLLM([{ lines: ['x'], href: '/m/1' }], 'Web Page Data');

        expect(result.status).toBe('ok');
        expect(result.errors).toEqual([]);
        expect(result.records[0].homeTeam).toBe('Real Madrid');
    });

    it('fails cleanly on empty input rather than returning success:true with 0 records', async () => {
        const scraper = new IntelligentBrowserScraper(vi.fn());
        const result = await scraper.interpretExtractedDataWithLLM([], 'Web Page Data');
        expect(result.status).toBe('failed');
        expect(result.errors[0].code).toBe('EMPTY_INPUT');
    });
});
