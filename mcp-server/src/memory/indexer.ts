import fs from 'fs/promises';
import path from 'path';
import { vectorStore } from './vector.js';
import { memoryManager } from './index.js';
import { WorkspaceScanner } from '../cache/workspace.js';
import { WorkspaceWalker } from '../pipeline/middlewares/workspace-walker.js';
import { Sanitizer } from '../utils/Sanitizer.js';

import { DiffScanner } from '../pipeline/middlewares/diff-scanner.js';

export interface IndexingResult {
    totalFiles: number;
    indexedFiles: number;
    skippedFiles: number;
    errors: number;
}

export class WorkspaceIndexer {
    private workspaceScanner: WorkspaceScanner;

    constructor(workspaceRoot: string) {
        this.workspaceScanner = new WorkspaceScanner(workspaceRoot);
    }

    /**
     * Proactively index the workspace files.
     * Uses hash-based tracking to avoid redundant indexing.
     */
    async indexWorkspace(workspaceRoot: string, force: boolean = false): Promise<IndexingResult> {
        const wsHash = await this.workspaceScanner.getWorkspaceHash(workspaceRoot);
        
        if (force) {
            await vectorStore.deleteIndex(wsHash);
            // Also clear the hash cache in long-term memory for this workspace
            const allKeys = await memoryManager.longTerm.list();
            for (const key of allKeys) {
                if (key.startsWith(`file:${wsHash}:`) && key.endsWith(':hash')) {
                    await memoryManager.longTerm.delete(key);
                }
            }
        }

        const result: IndexingResult = { totalFiles: 0, indexedFiles: 0, skippedFiles: 0, errors: 0 };

        // 1. Scan changed files via DiffScanner
        let targetFiles: string[] = [];
        try {
            const diffScan = await DiffScanner.scan(workspaceRoot);
            if (diffScan && diffScan.hasGit && diffScan.changedFiles) {
                targetFiles = diffScan.changedFiles.map(f => path.resolve(workspaceRoot, f));
            }
        } catch (err) {
            console.error(`[WorkspaceIndexer] Git scanner failure:`, err);
        }

        const files = await WorkspaceWalker.findRelevantFiles(workspaceRoot, [], 1000);
        result.totalFiles = files.length;

        // If incremental git scan succeeded and not forced, only process changed files
        const filesToProcess = (targetFiles.length > 0 && !force)
            ? files.filter(f => targetFiles.includes(path.resolve(f)))
            : files;

        // 2. Process files sequentially to avoid race conditions in Vectra/Memory
        for (const file of filesToProcess) {
            try {
                const relativePath = path.relative(workspaceRoot, file);
                const vectorKey = `file:${wsHash}:${relativePath}`;
                
                // Get file stats to compare cheaper mtime before reading full file contents
                const stats = await fs.stat(file);
                const cacheKeyMtime = `${vectorKey}:mtime`;
                const cachedMtime = await memoryManager.longTerm.load(cacheKeyMtime);

                if (cachedMtime === stats.mtimeMs && !force) {
                    result.skippedFiles++;
                    continue;
                }

                const content = await fs.readFile(file, 'utf-8');
                const contentHash = vectorStore.calculateHash(content);

                // Load previous content from separate cache files to prevent memory.json bloat
                const cacheDir = path.join(workspaceRoot, '.free-llm-mcp', 'cache');
                const existingHash = await memoryManager.longTerm.load(`${vectorKey}:hash`);
                let previousContent: string | undefined;
                if (typeof existingHash === 'string' && existingHash) {
                    try {
                        previousContent = await fs.readFile(path.join(cacheDir, existingHash), 'utf-8');
                    } catch {}
                }

                if (existingHash === contentHash && !force) {
                    await memoryManager.longTerm.save(cacheKeyMtime, stats.mtimeMs);
                    result.skippedFiles++;
                    continue;
                }

                // 3. Upsert to Vectra
                const sanitizedContent = Sanitizer.sanitize(content);
                const ext = path.extname(file).toLowerCase();
                const { WorkspaceDependencyScanner } = await import('./dependency-scanner.js');
                const profile = WorkspaceDependencyScanner.generateSemanticProfile(content, ext);
                
                const profileStr = `File: ${relativePath}
Role: ${profile.docstring || 'Undocumented module'}
Provides: ${profile.exports.join(', ')}
Depends on: ${profile.imports.join(', ')}

Implementation Snippet:
${sanitizedContent.slice(0, 2000)}`;

                await vectorStore.upsert(wsHash, {
                    id: vectorKey,
                    content: profileStr,
                    metadata: { 
                        type: 'file',
                        path: relativePath,
                        ws: wsHash 
                    },
                    contentHash,
                    timestamp: Date.now()
                });

                // 4. Update hash cache (only 2 saves instead of 3, no :content bloat)
                await memoryManager.longTerm.save(`${vectorKey}:hash`, contentHash);
                await memoryManager.longTerm.save(`${vectorKey}:mtime`, stats.mtimeMs);

                // Save content to separate cache file using atomic write
                const { writeFileAtomic } = await import('../utils/FileUtils.js');
                try {
                    await fs.mkdir(cacheDir, { recursive: true });
                    await writeFileAtomic(path.join(cacheDir, contentHash), content);
                } catch (err) {
                    console.error(`[WorkspaceIndexer] Failed to cache content for ${relativePath}: ${err}`);
                }

                if (previousContent && previousContent !== content) {
                    await memoryManager.updateWorkspaceMemoryForSimilarFiles(
                        wsHash,
                        relativePath,
                        previousContent,
                        content
                    );
                }
                result.indexedFiles++;
            } catch (err) {
                console.error(`[WorkspaceIndexer] Failed to index ${file}: ${err}`);
                result.errors++;
            }
        }

        // 5. Build and update the Repository dependency & concept graph
        try {
            const mcpDir = path.join(workspaceRoot, '.free-llm-mcp');
            await fs.mkdir(mcpDir, { recursive: true });
            
            const graphPath = path.join(mcpDir, 'repo_graph.json');
            const wikiPath = path.join(mcpDir, 'wiki_links.md');
            const metaPath = path.join(mcpDir, 'wiki_cache_meta.json');

            let runScan = true;
            let currentCommitHash = '';
            
            // 5a. Determine if we can bypass scanning
            if (!force) {
                try {
                    const diffScan = await DiffScanner.scan(workspaceRoot);
                    if (diffScan && diffScan.hasGit) {
                        currentCommitHash = diffScan.lastCommitHash || '';
                        
                        // Compare with cached commit hash
                        try {
                            const metaContent = await fs.readFile(metaPath, 'utf-8');
                            const meta = JSON.parse(metaContent);
                            if (meta.lastCommitHash === currentCommitHash && currentCommitHash !== '') {
                                runScan = false;
                                console.error('[WorkspaceIndexer] Repository graph cache hit via Git commit hash');
                            }
                        } catch {}
                    }
                } catch (err) {
                    console.error('[WorkspaceIndexer] Failed to check Git HEAD commit for cache bypass:', err);
                }
            }

            if (runScan) {
                const { RepositoryGraph, WorkspaceDependencyScanner } = await import('./dependency-scanner.js');
                const scanner = new WorkspaceDependencyScanner(workspaceRoot);
                const graph = new RepositoryGraph(workspaceRoot);
                
                await scanner.scanWorkspace(graph);
                
                // Serialize graph
                const serialized = graph.serialize();
                await fs.writeFile(graphPath, JSON.stringify(serialized, null, 2), 'utf-8');
                
                // Generate Wiki links markdown
                const wikiMd = scanner.generateWikiLinksMarkdown(graph);
                await fs.writeFile(wikiPath, wikiMd, 'utf-8');
                
                // Save cache meta
                const meta = {
                    lastCommitHash: currentCommitHash,
                    lastScannedAt: Date.now()
                };
                await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
                console.error('[WorkspaceIndexer] Rebuilt repository dependency graph and wiki index.');
            }
        } catch (err) {
            console.error('[WorkspaceIndexer] Failed to run repository dependency graph scanner:', err);
        }

        await memoryManager.flush();
        return result;
    }
}

