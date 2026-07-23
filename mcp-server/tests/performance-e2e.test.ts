import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { withFileLock } from '../src/utils/file-lock.js';
import { initFirebase } from '../src/utils/firebase.js';
import { persistence } from '../src/utils/PersistenceManager.js';

describe('Performance & Concurrency E2E Verification', () => {
    const testDir = path.join(os.tmpdir(), 'mcp-perf-e2e-' + Date.now());
    const lockTestFile = path.join(testDir, 'shared-resource.txt');

    beforeEach(async () => {
        await fs.ensureDir(testDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('Test 1: Multi-Process Lock Concurrency Stress Test', async () => {
        const concurrencyCount = 8;
        const appendCount = 10;
        const appendSequence: number[] = [];

        // Simulate concurrent lock requests using parallel async tasks
        const tasks = Array.from({ length: concurrencyCount }).map((_, processIdx) => {
            return (async () => {
                for (let i = 0; i < appendCount; i++) {
                    await withFileLock(lockTestFile, async () => {
                        // Critical Section
                        appendSequence.push(processIdx);
                        // Add a small delay to force overlap window
                        await new Promise(resolve => setTimeout(resolve, 5));
                    }, 5000);
                }
            })();
        });

        await Promise.all(tasks);

        // Verify that all append operations succeeded
        expect(appendSequence.length).toBe(concurrencyCount * appendCount);
    });

    it('Test 2: Telemetry Timeout Offline Fast-Path Interception', async () => {
        // Mock global fetch to simulate connection timeout (ConnectTimeoutError / TypeError)
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
            return new Promise((_, reject) => {
                setTimeout(() => reject(new TypeError('fetch failed (ConnectTimeoutError)')), 5);
            });
        });

        // Set env variables so Firebase tries to initialize
        vi.stubEnv('FIREBASE_API_KEY', 'fake-api-key');
        vi.stubEnv('FIREBASE_PROJECT_ID', 'fake-project-id');

        const stateFile = path.join(testDir, 'usage-stats.json');
        persistence['filePath'] = stateFile;
        persistence['backupPath'] = stateFile + '.bak';

        // Clear lastAuthFailedTime
        const state = await persistence.load();
        state.lastAuthFailedTime = undefined;
        await persistence.save(state);

        // 1. Initial auth attempt: fails and triggers offline fallback
        const start1 = Date.now();
        const uid1 = await initFirebase();
        const elapsed1 = Date.now() - start1;

        expect(uid1).toBeDefined();
        expect(fetchSpy).toHaveBeenCalled();
        
        // Reload state to confirm failure timestamp is recorded
        const stateAfterFail = await persistence.load();
        expect(stateAfterFail.lastAuthFailedTime).toBeDefined();

        // 2. Second auth attempt: should fast-path to offline fallback immediately without calling fetch
        fetchSpy.mockClear();
        const start2 = Date.now();
        const uid2 = await initFirebase();
        const elapsed2 = Date.now() - start2;

        expect(uid2).toBeDefined();
        expect(fetchSpy).not.toHaveBeenCalled(); // fetch skipped due to 1-hour backoff!
        expect(elapsed2).toBeLessThan(10); // resolves instantly
    });

    it('Test 3: Workspace Indexer Memory Leak Profiling', async () => {
        const { WorkspaceDependencyScanner } = await import('../src/memory/dependency-scanner.js');
        const { RepositoryGraph } = await import('../src/memory/dependency-scanner.js');

        // Capture initial memory baseline
        if (global.gc) global.gc();
        const initialHeap = process.memoryUsage().heapUsed;

        // Create some dummy files in the test directory to index
        const filesToCreate = 100; // Increased to 100 files to make heap differences more measurable
        for (let i = 0; i < filesToCreate; i++) {
            const filePath = path.join(testDir, `file-${i}.ts`);
            await fs.writeFile(filePath, `
                export function func${i}() {
                    console.log("hello from ${i}");
                }
                import { func${(i + 1) % filesToCreate} } from "./file-${(i + 1) % filesToCreate}.js";
                func${(i + 1) % filesToCreate}();
            `, 'utf8');
        }

        const scanner = new WorkspaceDependencyScanner(testDir);
        const graph = new RepositoryGraph(testDir);

        // Scan the workspace
        await scanner.scanWorkspace(graph);

        // Verify that the internal caches are fully evacuated to free up heap memory
        expect(scanner['fileContentCache'].size).toBe(0);
        expect(scanner['snippetContentCache'].size).toBe(0);
        expect(scanner['workspaceFiles'].size).toBe(0);

        // Capture heap usage after scanning and cache evacuation
        if (global.gc) global.gc();
        const finalHeap = process.memoryUsage().heapUsed;
        const heapGrowthMb = (finalHeap - initialHeap) / (1024 * 1024);

        // Assert heap growth is bounded within 10MB
        expect(heapGrowthMb).toBeLessThan(10);
    });

    it('Test 4: High-Scale Multi-Language Monorepo Profiling (1000 Files)', async () => {
        const { WorkspaceDependencyScanner } = await import('../src/memory/dependency-scanner.js');
        const { RepositoryGraph } = await import('../src/memory/dependency-scanner.js');

        const monorepoDir = path.join(testDir, 'monorepo-1000');
        await fs.ensureDir(monorepoDir);

        if (global.gc) global.gc();
        const initialHeap = process.memoryUsage().heapUsed;

        // Generate 1,000 multi-language files with interdependent imports
        const filesCount = 1000;
        for (let i = 0; i < filesCount; i++) {
            const nextIdx = (i + 1) % filesCount;
            if (i % 3 === 0) {
                // TypeScript
                const filePath = path.join(monorepoDir, `file_${i}.ts`);
                await fs.writeFile(filePath, `
                    export function func_${i}() { return ${i}; }
                    import { func_${nextIdx} } from "./file_${nextIdx}.js";
                    func_${nextIdx}();
                `, 'utf8');
            } else if (i % 3 === 1) {
                // Python
                const filePath = path.join(monorepoDir, `file_${i}.py`);
                await fs.writeFile(filePath, `
def func_${i}():
    return ${i}

from file_${nextIdx} import func_${nextIdx}
func_${nextIdx}()
`, 'utf8');
            } else {
                // Go
                const filePath = path.join(monorepoDir, `file_${i}.go`);
                await fs.writeFile(filePath, `
package main
import "project/file_${nextIdx}"
func main() {
    file_${nextIdx}.Func()
}
`, 'utf8');
            }
        }

        const scanner = new WorkspaceDependencyScanner(monorepoDir);
        const graph = new RepositoryGraph(monorepoDir);

        // Scan the 1,000-file monorepo
        await scanner.scanWorkspace(graph);

        // Verify caches were cleanly evacuated
        expect(scanner['fileContentCache'].size).toBe(0);
        expect(scanner['snippetContentCache'].size).toBe(0);
        expect(scanner['workspaceFiles'].size).toBe(0);

        // Assert resulting dependency graph nodes and edges were mapped
        expect(graph.getAllNodes().length).toBeGreaterThan(0);

        if (global.gc) global.gc();
        const finalHeap = process.memoryUsage().heapUsed;
        const heapGrowthMb = (finalHeap - initialHeap) / (1024 * 1024);

        // Under 1000 files, memory growth should be extremely minimal (under 15MB)
        expect(heapGrowthMb).toBeLessThan(15);
    }, 15000); // 15-second timeout for slower I/O filesystems
});
