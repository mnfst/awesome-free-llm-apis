import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import { promises as fs } from 'fs';
import { withFileLock } from '../src/utils/file-lock.js';

describe('file-lock', () => {
    const testDir = path.resolve('./tests/temp-file-lock-test');
    const testFile = path.join(testDir, 'test.lockable');
    const lockFile = `${testFile}.lock`;

    beforeEach(async () => {
        // Ensure test directory exists and is clean
        await fs.mkdir(testDir, { recursive: true });
        try {
            await fs.unlink(lockFile);
        } catch {}
        try {
            await fs.unlink(testFile);
        } catch {}
    });

    afterAll(async () => {
        // Cleanup test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {}
    });

    it('should run operations exclusively (concurrency check)', async () => {
        const events: string[] = [];

        const op1 = withFileLock(testFile, async () => {
            events.push('op1-start');
            await new Promise(resolve => setTimeout(resolve, 150));
            events.push('op1-end');
            return 'op1-result';
        });

        // Delay starting op2 slightly to ensure op1 acquires the lock first
        await new Promise(resolve => setTimeout(resolve, 30));

        const op2 = withFileLock(testFile, async () => {
            events.push('op2-start');
            events.push('op2-end');
            return 'op2-result';
        });

        const [res1, res2] = await Promise.all([op1, op2]);

        expect(res1).toBe('op1-result');
        expect(res2).toBe('op2-result');
        expect(events).toEqual([
            'op1-start',
            'op1-end',
            'op2-start',
            'op2-end'
        ]);
    });

    it('should throw timeout exception when lock cannot be acquired', async () => {
        const op1 = withFileLock(testFile, async () => {
            await new Promise(resolve => setTimeout(resolve, 300));
        });

        // Delay starting op2 slightly to ensure op1 has acquired the lock
        await new Promise(resolve => setTimeout(resolve, 50));

        const op2Promise = withFileLock(testFile, async () => {
            // Should not be reached
        }, 100); // 100ms timeout, which is shorter than op1's remaining duration

        await expect(op2Promise).rejects.toThrow(/Timeout waiting for lock on file:/);
        await op1; // clean up op1
    });

    it('should reap lock if the holding PID is dead', async () => {
        // Write a dead/non-existent PID to the lock file
        const deadPid = 999999;
        await fs.mkdir(path.dirname(lockFile), { recursive: true });
        await fs.writeFile(lockFile, String(deadPid), 'utf8');

        // Verify we can acquire the lock immediately because the PID is dead
        const start = Date.now();
        const result = await withFileLock(testFile, async () => {
            return 'acquired';
        }, 1000);

        const duration = Date.now() - start;
        expect(result).toBe('acquired');
        // Reaping should happen immediately, so duration should be very small
        expect(duration).toBeLessThan(500);

        // Verify the lock file is cleaned up after completion
        await expect(fs.stat(lockFile)).rejects.toThrow();
    });

    it('should reap lock if the lock file is older than STALE_LOCK_MS', async () => {
        // Create a lock file held by the current process PID (which is alive)
        await fs.mkdir(path.dirname(lockFile), { recursive: true });
        await fs.writeFile(lockFile, String(process.pid), 'utf8');

        // Backdate the lock file to be older than STALE_LOCK_MS (30000ms)
        const oldTime = new Date(Date.now() - 40000);
        await fs.utimes(lockFile, oldTime, oldTime);

        // Verify we can acquire the lock because it is older than STALE_LOCK_MS
        const start = Date.now();
        const result = await withFileLock(testFile, async () => {
            return 'acquired-stale';
        }, 1000);

        const duration = Date.now() - start;
        expect(result).toBe('acquired-stale');
        expect(duration).toBeLessThan(500);

        // Verify the lock file is cleaned up after completion
        await expect(fs.stat(lockFile)).rejects.toThrow();
    });
});
