import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistenceManager, PersistentUsage } from '../src/utils/PersistenceManager.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { encrypt, decrypt } from '../src/utils/encryption.js';

describe('Persistence Layer Hardening', () => {
    const testDir = path.join(os.tmpdir(), 'mcp-persistence-test-' + Date.now());
    const testFile = path.join(testDir, 'usage.json');

    beforeEach(async () => {
        await fs.ensureDir(testDir);
        vi.stubEnv('MCP_SECRET_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    });

    afterEach(async () => {
        await fs.remove(testDir);
        vi.unstubAllEnvs();
    });

    it('should initialize with empty state if file missing', async () => {
        const pm = new PersistenceManager(testFile);
        const state = await pm.load();
        
        expect(state.dailyTotalRequests).toBe(0);
        expect(state.lifetimeTotalRequests).toBe(0);
        expect(state.providers).toEqual({});
    });

    it('should perform atomic Read-Merge-Write (JSON Update Test)', async () => {
        const pm = new PersistenceManager(testFile);
        
        // 1. Initial save
        const initialState: PersistentUsage = {
            lastResetDate: new Date().toISOString().split('T')[0],
            dailyTotalRequests: 1,
            dailyTotalTokens: 100,
            lifetimeTotalRequests: 1,
            lifetimeTotalTokens: 100,
            providers: {
                'p1': { lastSyncTime: Date.now(), localTotalRequests: 1, localTotalTokens: 100 }
            }
        };
        await pm.save(initialState);

        // 2. Simulate concurrent update on disk
        const rawContent = await fs.readFile(testFile, 'utf8');
        const decryptedContent = await decrypt(rawContent);
        const diskState = JSON.parse(decryptedContent);
        diskState.dailyTotalRequests = 10; // Modified by "another process"
        diskState.providers = diskState.providers || {};
        diskState.providers['p2'] = { lastSyncTime: Date.now(), localTotalRequests: 5, localTotalTokens: 500 };
        
        const encryptedDisk = await encrypt(JSON.stringify(diskState));
        await fs.writeFile(testFile, encryptedDisk, 'utf8');

        // 3. Current process saves its state (which only knows about p1)
        const memoryState: PersistentUsage = {
            ...initialState,
            dailyTotalRequests: 2, // Incremented in memory
            providers: {
                'p1': { lastSyncTime: Date.now() + 100, localTotalRequests: 2, localTotalTokens: 200 }
            }
        };
        await pm.save(memoryState);

        // 4. Verify Merge logic
        const finalRaw = await fs.readFile(testFile, 'utf8');
        const finalDecrypted = await decrypt(finalRaw);
        const finalState = JSON.parse(finalDecrypted);
        
        // Global daily counts should be additive (atomic RMW merge using deltas)
        expect(finalState.dailyTotalRequests).toBe(11); // base(10) + delta(1) = 11
        
        // p1 should be updated (latest sync wins)
        expect(finalState.providers['p1'].localTotalRequests).toBe(2);
        
        // p2 should be preserved (merged from disk)
        expect(finalState.providers['p2']).toBeDefined();
        expect(finalState.providers['p2'].localTotalRequests).toBe(5);
    });

    it('should handle daily reset on loading stale data', async () => {
        const pm = new PersistenceManager(testFile);
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const staleData: PersistentUsage = {
            lastResetDate: yesterdayStr,
            dailyTotalRequests: 500,
            dailyTotalTokens: 50000,
            lifetimeTotalRequests: 1000,
            lifetimeTotalTokens: 100000,
            providers: {}
        };
        const encryptedStale = await encrypt(JSON.stringify(staleData));
        await fs.writeFile(testFile, encryptedStale, 'utf8');

        const loaded = await pm.load();
        
        expect(loaded.lastResetDate).toBe(new Date().toISOString().split('T')[0]);
        expect(loaded.dailyTotalRequests).toBe(0); // Reset
        expect(loaded.lifetimeTotalRequests).toBe(1000); // Preserved
    });

    it('recovers the Firebase identity from the .bak file when the primary file is corrupted', async () => {
        const pm = new PersistenceManager(testFile);

        const stateWithIdentity: PersistentUsage = {
            lastResetDate: new Date().toISOString().split('T')[0],
            dailyTotalRequests: 3,
            dailyTotalTokens: 300,
            lifetimeTotalRequests: 3,
            lifetimeTotalTokens: 300,
            firebaseUid: 'uid-should-survive',
            firebaseRefreshToken: 'refresh-should-survive',
            providers: {}
        };
        await pm.save(stateWithIdentity);

        // Corrupt only the primary file — the .bak written alongside save() should still be intact.
        await fs.writeFile(testFile, 'not-valid-encrypted-json', 'utf8');

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const recovered = await pm.load();
        errorSpy.mockRestore();

        expect(recovered.firebaseUid).toBe('uid-should-survive');
        expect(recovered.firebaseRefreshToken).toBe('refresh-should-survive');
    });

    it('serializes concurrent save() calls so a Firebase-identity save is never clobbered by a racing counter-only save', async () => {
        const pm = new PersistenceManager(testFile);

        // Seed disk with no identity yet, matching a fresh install.
        await pm.save({
            lastResetDate: new Date().toISOString().split('T')[0],
            dailyTotalRequests: 0, dailyTotalTokens: 0, lifetimeTotalRequests: 0, lifetimeTotalTokens: 0,
            providers: {}
        });

        // Force the exact interleaving that reproduces the bug without the lock: delay the
        // FIRST writeFile call (the counter-only save's tmp write) so it lands AFTER the
        // identity save's own read-merge-write has fully completed — the counter-only save
        // already read a stale (no-identity) disk snapshot before that point, so its delayed
        // write clobbers the identity the other save just persisted.
        const originalWriteFile = fs.writeFile.bind(fs);
        let writeCount = 0;
        const writeFileSpy = vi.spyOn(fs, 'writeFile').mockImplementation(async (...args: any[]) => {
            writeCount++;
            if (writeCount === 1) {
                await new Promise(r => setTimeout(r, 150));
            }
            return (originalWriteFile as any)(...args);
        });

        const counterOnlySave = pm.save({
            lastResetDate: new Date().toISOString().split('T')[0],
            dailyTotalRequests: 5, dailyTotalTokens: 500, lifetimeTotalRequests: 5, lifetimeTotalTokens: 500,
            providers: {}
        });
        // Give counterOnlySave time to finish its read+merge and reach its (now-delayed) write.
        await new Promise(r => setTimeout(r, 10));
        const identitySave = pm.save({
            lastResetDate: new Date().toISOString().split('T')[0],
            dailyTotalRequests: 0, dailyTotalTokens: 0, lifetimeTotalRequests: 0, lifetimeTotalTokens: 0,
            firebaseUid: 'uid-must-survive',
            firebaseRefreshToken: 'refresh-must-survive',
            providers: {}
        });

        await Promise.all([counterOnlySave, identitySave]);
        writeFileSpy.mockRestore();

        const finalRaw = await fs.readFile(testFile, 'utf8');
        const finalState = JSON.parse(await decrypt(finalRaw));
        expect(finalState.firebaseUid).toBe('uid-must-survive');
        expect(finalState.firebaseRefreshToken).toBe('refresh-must-survive');
    });

    it('logs loudly (console.error) and loses identity only when both primary and backup are unreadable', async () => {
        const pm = new PersistenceManager(testFile);
        await fs.writeFile(testFile, 'not-valid-encrypted-json', 'utf8');
        // No .bak file exists at all in this scenario.

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await pm.load();

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('INCLUDING FIREBASE IDENTITY'));
        expect(result.firebaseUid).toBeUndefined();
        errorSpy.mockRestore();
    });
});
