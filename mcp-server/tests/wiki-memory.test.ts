import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WikiMemory } from '../src/memory/wiki.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { wikiConfig } from '../src/config/wiki-config.js';

describe('WikiMemory (Phase B)', () => {
    const testDir = path.join(process.cwd(), 'temp_test_wiki_ws');
    const wsHash = 'test_workspace_hash';

    beforeEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('write() creates page with frontmatter and confidence=0.5', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        const page = await wiki.write('JWT Authentication', 'JWT tokens validated in middleware.', ['auth'], ['Express Middleware']);
        
        expect(page.title).toBe('JWT Authentication');
        expect(page.confidence).toBe(0.5);
        expect(page.tags).toContain('auth');
        expect(page.links).toContain('Express Middleware');
        
        // Check file exists
        const safeName = 'jwt_authentication.md';
        const filePath = path.join(testDir, wsHash, safeName);
        expect(existsSync(filePath)).toBe(true);

        const raw = await fs.readFile(filePath, 'utf-8');
        expect(raw).toContain('title: JWT Authentication');
        expect(raw).toContain('confidence: 0.5');
    });

    it('write() same page again increments confidence by 0.15', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        
        // First write (confidence 0.5)
        let page = await wiki.write('JWT Authentication', 'JWT tokens validated in middleware.');
        expect(page.confidence).toBe(0.5);

        // Second write (confidence 0.65)
        page = await wiki.write('JWT Authentication', 'JWT tokens validated in middleware.');
        expect(page.confidence).toBe(0.65);

        // Multiple writes cap at 1.0
        for (let i = 0; i < 5; i++) {
            page = await wiki.write('JWT Authentication', 'JWT tokens validated in middleware.');
        }
        expect(page.confidence).toBe(1.0);
    });

    it('search() returns pages sorted by persona weight × confidence', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        
        // Write a page with coder-relevant tag and lower confidence (e.g. 0.6)
        // Wait, write() twice gives confidence 0.65
        await wiki.write('Express Middleware', 'Express middleware description', ['ts', 'code']);
        await wiki.write('Express Middleware', 'Express middleware description', ['ts', 'code']);
        
        // Write a page with researcher-relevant tag but high confidence (e.g. 0.8)
        // Wait, write() three times gives 0.80
        await wiki.write('Research Study', 'Researcher content description', ['study']);
        await wiki.write('Research Study', 'Researcher content description', ['study']);
        await wiki.write('Research Study', 'Researcher content description', ['study']);

        // Search with coder persona
        const coderResults = await wiki.search('Express', 'coder');
        // Express Middleware should be sorted first because coder tags weight it higher
        expect(coderResults.length).toBeGreaterThan(0);
        expect(coderResults[0].title).toBe('Express Middleware');

        // Search with researcher persona
        const researcherResults = await wiki.search('description', 'researcher');
        // Research Study should be sorted first
        expect(researcherResults.length).toBeGreaterThan(0);
        expect(researcherResults[0].title).toBe('Research Study');
    });

    it('search() weights the cyber persona toward security-tagged pages', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        await wiki.write('nmap', 'Network scanning tool.', ['cyber', 'github-tool']);
        await wiki.write('generic-utils', 'Unrelated general utility library.', ['code']);

        const cyberResults = await wiki.search('tool', 'cyber');
        expect(cyberResults.length).toBeGreaterThan(0);
        expect(cyberResults[0].title).toBe('nmap');
    });

    it('resolveLink() returns 3-line summary, not full page', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        
        const longContent = `## Summary
This is line 1 of the summary.
This is line 2 of the summary.
This is line 3 of the summary.
This is line 4 of the summary.
Some other details.`;

        await wiki.write('JWT Authentication', longContent);

        const summary = await wiki.resolveLink('JWT Authentication');
        const lines = summary.split('\n').filter(Boolean);
        
        expect(lines.length).toBe(3);
        expect(lines[0]).toContain('line 1');
        expect(lines[2]).toContain('line 3');
    });

    it('recordADR() triggers when confidence >= 0.85 and decision pattern detected', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        
        // We write 4 times to get confidence >= 0.95 (0.5 -> 0.65 -> 0.80 -> 0.95)
        // Body contains decision pattern "decided to use PostgreSQL"
        let page;
        for (let i = 0; i < 4; i++) {
            page = await wiki.write(
                'Database Choice', 
                'We decided to use PostgreSQL for this project because of JSONB support.', 
                ['db']
            );
        }

        expect(page?.confidence).toBeGreaterThanOrEqual(0.85);
        expect(page?.adr_ref).toBeDefined();
        expect(page?.adr_ref).toBe('ADR-001');

        const adrFile = path.join(testDir, wsHash, 'adr', 'ADR-001.md');
        expect(existsSync(adrFile)).toBe(true);
        const adrRaw = await fs.readFile(adrFile, 'utf-8');
        expect(adrRaw).toContain('decided to use PostgreSQL');
    });

    it('markStale() sets confidence=0.0 and adds Stale header', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        await wiki.write('JWT Authentication', 'JWT validation middleware');
        
        await wiki.markStale('JWT Authentication', 'File auth.ts deleted');
        
        const page = await wiki.read('JWT Authentication');
        expect(page?.confidence).toBe(0.0);
        expect(page?.content).toContain('Stale — Source Deleted');
        expect(page?.content).toContain('File auth.ts deleted');
    });

    it('write() rejects pages exceeding maxPageSizeBytes', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        const hugeContent = 'a'.repeat(wikiConfig.maxPageSizeBytes + 100);
        
        await expect(
            wiki.write('Huge Page', hugeContent)
        ).rejects.toThrow(/exceeds/i);
    });

    it('reinforce() bumps confidence and promotes tier at the 0.8 boundary', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        await wiki.write('Retry Backoff', 'Exponential backoff prevents thundering herd.');
        let page = await wiki.read('Retry Backoff');
        expect(page?.confidence).toBe(0.5);
        expect(page?.tier).toBe('episodic');

        page = await wiki.reinforce('Retry Backoff');
        expect(page?.confidence).toBeCloseTo(0.65);

        page = await wiki.reinforce('Retry Backoff');
        page = await wiki.reinforce('Retry Backoff');
        expect(page?.confidence).toBeGreaterThanOrEqual(0.8);
        expect(page?.tier).toBe('semantic');
    });

    it('reinforce() caps confidence at 1.0 and is a no-op for missing pages', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        await wiki.write('Cache Layer', 'LRU cache in front of provider calls.');
        for (let i = 0; i < 10; i++) {
            await wiki.reinforce('Cache Layer');
        }
        const page = await wiki.read('Cache Layer');
        expect(page?.confidence).toBe(1.0);

        const missing = await wiki.reinforce('Nonexistent Page');
        expect(missing).toBeNull();
    });

    it('recordFailure() lowers confidence, floors at 0, and appends a failure note', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        await wiki.write('Flaky Provider', 'Provider X occasionally times out.');
        await wiki.reinforce('Flaky Provider'); // 0.65

        const page = await wiki.recordFailure('Flaky Provider', 'Timed out again on retry.');
        expect(page?.confidence).toBeCloseTo(0.5);
        expect(page?.content).toContain('Failure recorded');
        expect(page?.content).toContain('Timed out again on retry.');

        let floored;
        for (let i = 0; i < 10; i++) {
            floored = await wiki.recordFailure('Flaky Provider', 'Still failing.');
        }
        expect(floored?.confidence).toBe(0);

        const missing = await wiki.recordFailure('Nonexistent Page', 'n/a');
        expect(missing).toBeNull();
    });

    it('wiki capped at 500 pages, oldest low-confidence page evicted', async () => {
        const wiki = new WikiMemory(wsHash, testDir);
        
        // First page is low confidence (0.5)
        await wiki.write('Old Page', 'Old content');
        
        // Write 500 more pages of high confidence (say, 0.8, created by writing twice)
        for (let i = 1; i <= 500; i++) {
            await wiki.write(`Page ${i}`, `Content ${i}`);
            await wiki.write(`Page ${i}`, `Content ${i}`);
        }

        // Wait, total pages written is 501. The oldest low-confidence one (Old Page) should be evicted.
        const oldPage = await wiki.read('Old Page');
        expect(oldPage).toBeNull();

        // High confidence pages should still exist
        const page500 = await wiki.read('Page 500');
        expect(page500).not.toBeNull();
    });
});
