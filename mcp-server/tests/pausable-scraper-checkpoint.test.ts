import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ScrapingSessionCheckpointManager, ScrapingSessionCheckpoint } from '../src/tools/browser-action.js';

describe('Pausable/Resumable Scraping Session Checkpoint Tests', () => {
    it('creates, persists, loads, and resumes a scraping session checkpoint', async () => {
        const outputDir = path.join(process.cwd(), 'data', 'scrapes_test_cp');
        const sessionId = 'test_checkpoint_session';

        const initialCheckpoint: ScrapingSessionCheckpoint = {
            sessionId,
            targetUrl: 'https://www.sofascore.com/football',
            domainContext: 'Football Matches',
            status: 'INITIALIZED',
            currentPage: 1,
            visitedUrls: ['https://www.sofascore.com/football'],
            pendingUrlQueue: ['https://www.sofascore.com/football/match/1'],
            domStateFingerprint: '9a111fd54e3561b6',
            accumulatedRecords: [{ id: 1, title: 'Team A vs Team B' }],
            deepRecords: [],
            discoveredSections: ['Matches', 'Trending'],
            lastUpdated: new Date().toISOString()
        };

        // 1. Save initial checkpoint
        const savedPath = await ScrapingSessionCheckpointManager.saveCheckpoint(outputDir, initialCheckpoint);
        expect(savedPath).toContain('test_checkpoint_session_checkpoint.json');

        // 2. Load checkpoint
        const loaded = await ScrapingSessionCheckpointManager.loadCheckpoint(outputDir, sessionId);
        expect(loaded).not.toBeNull();
        expect(loaded?.status).toBe('INITIALIZED');
        expect(loaded?.accumulatedRecords).toHaveLength(1);

        // 3. Resume & update checkpoint
        loaded!.status = 'PAUSED';
        loaded!.accumulatedRecords.push({ id: 2, title: 'Team C vs Team D' });
        await ScrapingSessionCheckpointManager.saveCheckpoint(outputDir, loaded!);

        // 4. Verify updated state
        const reloaded = await ScrapingSessionCheckpointManager.loadCheckpoint(outputDir, sessionId);
        expect(reloaded?.status).toBe('PAUSED');
        expect(reloaded?.accumulatedRecords).toHaveLength(2);

        // Cleanup test dir
        await fs.rm(outputDir, { recursive: true, force: true });
    });
});
