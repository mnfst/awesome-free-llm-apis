import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { memoryManager } from '../src/memory/index.js';
import { WorkspaceScanner } from '../src/cache/workspace.js';
import { WorkspaceIndexer } from '../src/memory/indexer.js';
import { VectorStore } from '../src/memory/vector.js';
import { WorkspaceWalker } from '../src/pipeline/middlewares/workspace-walker.js';

describe('Memory & Storage Architecture Hardening', () => {
    const testDir = path.join(os.tmpdir(), `mcp-ebbinghaus-test-${Date.now()}`);

    beforeEach(async () => {
        await fs.ensureDir(testDir);
    });

    describe('Reinforced Ebbinghaus Memory Decay', () => {
        it('calculates decay with repetition-based reinforcement', () => {
            const freshEntry = {
                content: 'Important rule',
                confidence: 1.0,
                sourceCount: 1,
                lastConfirmedAt: Date.now()
            };

            const reinforcedEntry = {
                content: 'Frequently confirmed ADR',
                confidence: 1.0,
                sourceCount: 10,
                lastConfirmedAt: Date.now()
            };

            const daysSince = 30;
            const freshDecayed = memoryManager.calculateDecayedConfidence(freshEntry, daysSince);
            const reinforcedDecayed = memoryManager.calculateDecayedConfidence(reinforcedEntry, daysSince);

            // Fresh entry should decay faster than frequently confirmed entry
            expect(freshDecayed).toBeLessThan(reinforcedDecayed);
            expect(freshDecayed).toBeGreaterThan(0.3);
            expect(freshDecayed).toBeLessThan(0.45);
            expect(reinforcedDecayed).toBeGreaterThan(0.8);
        });

        it('preserves pinned or infinite half-life entries', () => {
            const pinnedEntry = {
                content: 'Permanent architectural rule',
                confidence: 0.95,
                sourceCount: 1,
                pinned: true
            };
            const decayed = memoryManager.calculateDecayedConfidence(pinnedEntry, 365);
            expect(decayed).toBe(0.95);
        });
    });

    describe('Workspace Hash Normalization', () => {
        it('normalizes casing and slashes so workspace hash is stable', async () => {
            const scanner = new WorkspaceScanner(testDir);
            const pathA = testDir.replace(/\\/g, '/');
            const pathB = testDir.replace(/\//g, '\\');

            const hashA = await scanner.getWorkspaceHash(pathA);
            const hashB = await scanner.getWorkspaceHash(pathB);
            expect(hashA).toBe(hashB);
        });
    });

    describe('Exclusion of .free-llm-mcp and data directories from RAG', () => {
        it('strictly excludes .free-llm-mcp/cache and repo_graph.json from workspace walking', async () => {
            // Create source files and internal metadata files
            await fs.ensureDir(path.join(testDir, 'src'));
            await fs.writeFile(path.join(testDir, 'src', 'app.ts'), 'export const app = 1;');

            await fs.ensureDir(path.join(testDir, '.free-llm-mcp', 'cache'));
            await fs.writeFile(path.join(testDir, '.free-llm-mcp', 'cache', 'hash123'), 'stale cached code');
            await fs.writeFile(path.join(testDir, '.free-llm-mcp', 'repo_graph.json'), '{nodes: []}');
            await fs.writeFile(path.join(testDir, '.free-llm-mcp', 'wiki_maintenance_meta.json'), '{meta: 1}');

            const files = await WorkspaceWalker.findRelevantFiles(testDir, ['app', 'cache', 'graph'], 100);
            
            const normalizedFiles = files.map(f => f.replace(/\\/g, '/'));
            expect(normalizedFiles.some(f => f.includes('src/app.ts'))).toBe(true);
            expect(normalizedFiles.some(f => f.includes('.free-llm-mcp'))).toBe(false);
            expect(normalizedFiles.some(f => f.includes('cache/hash123'))).toBe(false);
        });

        it('WorkspaceIndexer skips .free-llm-mcp internal files when indexing workspace', async () => {
            const indexer = new WorkspaceIndexer(testDir);
            const result = await indexer.indexWorkspace(testDir, true);

            expect(result.totalFiles).toBe(1); // Only src/app.ts, not the .free-llm-mcp files
            expect(result.indexedFiles).toBe(1);
        });
    });

    describe('Unified Storage Path Resolution', () => {
        it('VectorStore resolves to custom env or userdir data path', () => {
            const vs = new VectorStore();
            expect(vs['storageRoot']).toContain('vector-indices');
            expect(vs['storageRoot']).not.toBe('./data/vector-indices');
        });
    });
});
