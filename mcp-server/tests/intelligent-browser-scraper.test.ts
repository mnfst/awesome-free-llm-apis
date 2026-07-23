import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IntelligentBrowserScraper, ScriptPersistenceManager, DomStateFingerprinter } from '../src/tools/browser-action.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('IntelligentBrowserScraper Grounded LLM & Persistence Integration', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = path.join(os.tmpdir(), `browser-scraper-test-${Math.random().toString(36).slice(2, 8)}`);
        await fs.mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {}
    });

    it('processes dynamic raw DOM items using LLM in-the-loop and exports JSON and CSV', async () => {
        const mockLlmCaller = vi.fn().mockResolvedValue(
            JSON.stringify([
                { homeTeam: 'Arsenal', awayTeam: 'Chelsea', homeScore: '2', awayScore: '1', status: 'FT', competition: 'Premier League' },
                { homeTeam: 'Real Madrid', awayTeam: 'Barcelona', homeScore: '3', awayScore: '2', status: 'FT', competition: 'La Liga' }
            ])
        );

        const scraper = new IntelligentBrowserScraper(mockLlmCaller);

        const rawDomPayload = [
            { lines: ['Arsenal', '2', '1', 'Chelsea', 'FT'], href: '/match/123' },
            { lines: ['Real Madrid', '3', '2', 'Barcelona', 'FT'], href: '/match/456' }
        ];

        const result = await scraper.scrapeAndProcess({
            url: 'https://www.sofascore.com/football',
            domainContext: 'SofaScore Football',
            outputDir: tmpDir,
            filenameBase: 'sofascore_football_test'
        }, rawDomPayload);

        expect(result.success).toBe(true);
        expect(result.recordCount).toBe(2);
        expect(result.sampleRecords[0].homeTeam).toBe('Arsenal');
        expect(result.jsonPath).toBeDefined();
        expect(result.csvPath).toBeDefined();

        // Verify JSON content
        const jsonContent = JSON.parse(await fs.readFile(result.jsonPath!, 'utf-8'));
        expect(jsonContent.records).toHaveLength(2);
        expect(jsonContent.records[0].homeTeam).toBe('Arsenal');

        // Verify CSV content
        const csvContent = await fs.readFile(result.csvPath!, 'utf-8');
        expect(csvContent.startsWith('\uFEFF')).toBe(true);
        expect(csvContent).toContain('"Arsenal"');
    });

    it('saves and loads persisted extraction script memory to disk', async () => {
        const sessionId = 'test_session_persist';
        const sampleScript = `() => { return JSON.stringify([{ href: '/test', lines: ['A', 'B'] }]); }`;

        const savedPath = await ScriptPersistenceManager.saveScript(tmpDir, sessionId, sampleScript);
        expect(savedPath).toContain(`${sessionId}_script.js`);

        const loadedScript = await ScriptPersistenceManager.loadPersistedScript(tmpDir, sessionId);
        expect(loadedScript).toBe(sampleScript);
    });

    it('computes DOM state fingerprints and detects state transitions to prevent infinite loops', () => {
        const snapshot1 = 'div.container > button.tab-cricket (active)\nmatch-list: 5 matches';
        const snapshot2 = 'div.container > button.tab-cricket (active)\nmatch-list: 5 matches';
        const snapshot3 = 'div.container > button.tab-cricket (active)\nmatch-list: 10 matches';

        const hash1 = DomStateFingerprinter.computeHash(snapshot1);
        const hash2 = DomStateFingerprinter.computeHash(snapshot2);
        const hash3 = DomStateFingerprinter.computeHash(snapshot3);

        expect(hash1).toBe(hash2);
        expect(DomStateFingerprinter.hasStateChanged(hash1, hash2)).toBe(false); // No DOM mutation (no-op action)
        expect(DomStateFingerprinter.hasStateChanged(hash1, hash3)).toBe(true);  // Real DOM mutation!
    });
});
