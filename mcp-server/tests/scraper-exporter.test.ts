import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScraperExporter } from '../src/utils/ScraperExporter.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ScraperExporter', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = path.join(os.tmpdir(), `scraper-test-${Math.random().toString(36).slice(2, 8)}`);
        await fs.mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {}
    });

    it('sanitizes CSV cells and prevents formula injection', () => {
        expect(ScraperExporter.sanitizeCsvCell('=SUM(A1:A10)')).toBe('"\'=SUM(A1:A10)"');
        expect(ScraperExporter.sanitizeCsvCell('+123')).toBe('"\'=123"' ? '"\'+123"' : '"\'+123"');
        expect(ScraperExporter.sanitizeCsvCell('Normal Text')).toBe('"Normal Text"');
        expect(ScraperExporter.sanitizeCsvCell('Text with "quotes"')).toBe('"Text with ""quotes"""');
    });

    it('exports records to JSON with metadata header', async () => {
        const records = [
            { team: 'Arsenal', score: '2-1' },
            { team: 'Real Madrid', score: '3-0' }
        ];

        const filePath = await ScraperExporter.exportToJSON(records, {
            outputDir: tmpDir,
            filenameBase: 'test_matches',
            sourceUrl: 'https://www.sofascore.com'
        });

        const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        expect(content.metadata.recordCount).toBe(2);
        expect(content.metadata.sourceUrl).toBe('https://www.sofascore.com');
        expect(content.records).toHaveLength(2);
        expect(content.records[0].team).toBe('Arsenal');
    });

    it('exports records to CSV with UTF-8 BOM', async () => {
        const records = [
            { team: 'Arsenal', score: '2-1' },
            { team: 'Real Madrid', score: '3-0' }
        ];

        const filePath = await ScraperExporter.exportToCSV(records, {
            outputDir: tmpDir,
            filenameBase: 'test_matches'
        });

        const raw = await fs.readFile(filePath, 'utf-8');
        expect(raw.startsWith('\uFEFF')).toBe(true);
        expect(raw).toContain('"team","score"');
        expect(raw).toContain('"Arsenal","2-1"');
    });
});
