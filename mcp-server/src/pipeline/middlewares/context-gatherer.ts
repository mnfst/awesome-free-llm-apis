import { spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { WorkspaceWalker } from './workspace-walker.js';
import fs from 'fs/promises';
import { DiffScanner } from './diff-scanner.js';
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import { FIELD_LANGUAGE_MAP } from '../../memory/embedded-snippet-scanner.js';

const EMBEDDED_CODE_FIELD_MARKERS = Object.keys(FIELD_LANGUAGE_MAP).map(field => `"${field}"`);
const containsEmbeddedCodeField = (s: string): boolean => EMBEDDED_CODE_FIELD_MARKERS.some(marker => s.includes(marker));

/**
 * Robust spawn wrapper for cross-platform command execution.
 */
function spawnAsync(command: string, args: string[], timeoutMs = 10000): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        // Use shell: false to prevent cmd.exe from misinterpreting regex pipes (|) as command pipes
        const child = spawn(command, args, { shell: false });
        let stdout = '';
        let stderr = '';
        
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(`Command '${command}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.on('data', data => stdout += data.toString());
        child.stderr.on('data', data => stderr += data.toString());
        child.on('close', code => {
            clearTimeout(timeout);
            // rg and grep return 1 if no matches found, which we handle as success with empty results
            if (code === 0 || code === 1) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
            }
        });
        child.on('error', err => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

interface CacheEntry {
    results: string[];
    timestamp: number;
    branch: string;
}

import os from 'os';

const contextCache = new LRUCache<string, CacheEntry>({
    max: 500,
    ttl: 1000 * 60 * 30, // 30 minutes
});

export interface ContextGathererOptions {
    workspaceRoot: string;
    query: string;
    keywords?: string[];
    limit?: number;
    envType?: 'node' | 'python' | 'general';
    sessionId?: string;
    modelId?: string;
}

export class ContextGatherer {
    // No longer needed with spawn arguments array

    /**
     * Proactive Grep/RG context gathering.
     * Searches for relevant code snippets and architecture patterns.
     */
    static async gatherContext(options: ContextGathererOptions): Promise<string[]> {
        const { workspaceRoot, query, limit = 5 } = options;
        const grepStartMs = Date.now();

        // MD5 of workspace root to create unique key
        const wsHash = crypto.createHash('md5').update(workspaceRoot).digest('hex');
        
        // 1. Scan Git Diff (Background/non-blocking or quick cache)
        const scanResult = await DiffScanner.scan(workspaceRoot);
        const branch = scanResult.hasGit ? scanResult.currentBranch : 'main';
        const priorityFiles = scanResult.hasGit ? scanResult.changedFiles : [];

        // Check cache
        const queryHash = crypto.createHash('md5').update(query).digest('hex');
        const cacheKey = `${wsHash}:${branch}:${queryHash}`;
        const cached = contextCache.get(cacheKey);
        if (cached && cached.branch === branch) {
            const grepElapsedMs = Date.now() - grepStartMs;
            const sessionId = options.sessionId;
            if (sessionId) {
                try {
                    const homedir = os.homedir();
                    const projectsDir = path.join(homedir, '.free-llm-mcp', 'projects');
                    const entry = JSON.stringify({
                        ts: new Date().toISOString(),
                        sessionId,
                        type: 'grep_execution',
                        tool: 'cache',
                        query,
                        resultCount: cached.results.length,
                        elapsedMs: grepElapsedMs,
                        cacheHit: true
                    }) + '\n';
                    await fs.appendFile(path.join(projectsDir, sessionId, 'agentic-debug.log'), entry, 'utf-8');
                } catch {}
            }
            return cached.results;
        }

        // 2. Detect Environment
        let envType: 'node' | 'python' | 'general' = options.envType || 'general';
        if (envType === 'general') {
            try {
                const hasPkgJson = await fs.access(path.join(workspaceRoot, 'package.json')).then(() => true).catch(() => false);
                if (hasPkgJson) envType = 'node';
                else {
                    const hasReqs = await fs.access(path.join(workspaceRoot, 'requirements.txt')).then(() => true).catch(() => false);
                    if (hasReqs) envType = 'python';
                }
            } catch { }
        }

        // 3. Keyword Extraction
        const terms = new Set<string>();
        
        // 3.0. Add explicit keywords if provided
        if (options.keywords) {
            options.keywords.forEach(kw => {
                if (kw.length > 2) terms.add(kw);
            });
        }

        // 3a. Extract explicitly quoted terms
        const quotes = query.match(/["']([^"']+)["']/g) || [];
        quotes.forEach(q => {
            const term = q.replace(/["']/g, '').trim();
            if (term.length > 3) terms.add(term);
        });

        // 3b. Extract code blocks
        const codeBlocks = query.match(/```[\s\S]*?```/g) || [];
        codeBlocks.forEach(block => {
            block.split(/\W+/).filter(t => t.length > 5).forEach(t => terms.add(t));
        });

        // 3c. Extract inline code
        const inlineCode = query.match(/`([^`]+)`/g) || [];
        inlineCode.forEach(c => {
            const term = c.replace(/`/g, '').trim();
            term.split(/[\/\\._-]+/).forEach(part => {
                if (part.length >= 5) terms.add(part);
            });
            if (term.length > 3) terms.add(term);
        });

        // 3d. Fallback heuristics
        if (terms.size === 0) {
            const baseBroadKeywords = ['architecture', 'review', 'implementation', 'system', 'senior', 'software', 'project', 'please', 'could', 'would', 'where', 'how', 'what', 'why'];
            
            // Dynamically discover top-level folders as broad/organizational keywords
            let dynamicBroadKeywords: string[] = [];
            try {
                const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
                dynamicBroadKeywords = entries
                    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
                    .map(e => e.name.toLowerCase());
            } catch {}

            const projectName = path.basename(workspaceRoot);
            const projectKeywords = projectName.toLowerCase().split(/[-_.\s]+/).filter(k => k.length > 2);
            const broadKeywords = new Set([...baseBroadKeywords, ...projectKeywords, ...dynamicBroadKeywords]);

            query.split(/\W+/)
                .filter(t => t.length > 4 && !broadKeywords.has(t.toLowerCase()))
                .filter(t => /^[a-z]+(?:_[a-z0-9]+)+$|^[a-z]+(?:[A-Z][a-z0-9]+)+$|^[A-Z][a-z0-9]+(?:[a-z0-9]+)?$/.test(t) || t.length > 8)
                .forEach(t => terms.add(t));
        }

        const finalTerms = Array.from(terms).slice(0, 5);
        if (finalTerms.length === 0) return [];

        // 4. Combine terms into a single regex pattern for efficiency
        const combinedPattern = finalTerms.join('|');

        const { detectPersona } = await import('../../utils/persona-detector.js');
        const persona = detectPersona(query, workspaceRoot);

        const isTheoretical = /\b(doc|documentation|guide|explain|theory|writeup|summary|overview)\b/i.test(query) || persona === 'student' || persona === 'researcher';
        const overrideIgnores = /\b(override|all files|gitignored|ignored)\b/i.test(query);

        // 5. Rank Candidates with priorityFiles support
        let candidates = await WorkspaceWalker.findRelevantFiles(workspaceRoot, Array.from(terms), limit, overrideIgnores, isTheoretical, priorityFiles);
        let fallbackToRoot = false;
        if (candidates.length === 0) {
            candidates = [workspaceRoot];
            fallbackToRoot = true;
        }

        // 6. Tool Detection
        let tool: 'rg' | 'grep' | 'powershell' | 'none' = 'none';
        try {
            await spawnAsync('rg', ['--version']);
            tool = 'rg';
        } catch {
            try {
                await spawnAsync('grep', ['--version']);
                tool = 'grep';
            } catch {
                if (process.platform === 'win32') {
                    tool = 'powershell';
                } else {
                    return [];
                }
            }
        }

        // 7. Execute Search (Single pass with combined pattern)
        const results: string[] = [];
        let sortedFiles: string[] = [];
        try {
            let stdout = '';
            const contextLines = isTheoretical ? '4' : '2';
            const normalizedCandidates = candidates.map(c => c.replace(/\\/g, '/'));
            // We use a total match limit of 10 per file to prevent bloat. We bump limit to 50 for .log/.json files to ensure compaction triggers.
            const isLogOrJsonSearch = candidates.some(f => f.endsWith('.log') || f.endsWith('.json'));
            const matchLimit = isLogOrJsonSearch ? '50' : '10';
            
            if (tool === 'rg') {
                const args = ['-m', matchLimit, '-n', '-i', '-C', contextLines, '--no-heading', '-H'];
                if (overrideIgnores) args.push('-u');
                if (fallbackToRoot) {
                    args.push('-g', '!node_modules', '-g', '!.git', '-g', '!dist', '-g', '!build', '-g', '!venv', '-g', '!.venv', '-g', '!.free-llm-mcp', '-g', '!.gemini');
                }
                args.push('-e', `(${combinedPattern})`);
                args.push(...normalizedCandidates);
                
                const res = await spawnAsync('rg', args, 15000);
                stdout = res.stdout;
            } else if (tool === 'grep') {
                const extraArgs = fallbackToRoot ? ['-r', '--exclude-dir={node_modules,.git,dist,build,venv,.venv}'] : [];
                const args = ['-n', '-E', '-i', '-m', matchLimit, '-C', contextLines, '--with-filename']
                    .concat(extraArgs)
                    .concat([`(${combinedPattern})`])
                    .concat(normalizedCandidates);
                const res = await spawnAsync('grep', args, 15000);
                stdout = res.stdout;
            } else if (tool === 'powershell') {
                // Windows PowerShell Get-Content fallback - only run if pattern is safe (alphanumeric, pipes, underscores, hyphens)
                if (/^[a-zA-Z0-9_\-|]+$/.test(combinedPattern)) {
                    let targets = candidates;
                    if (fallbackToRoot) {
                        const files = await WorkspaceWalker.findRelevantFiles(workspaceRoot, [], 15, overrideIgnores, isTheoretical, priorityFiles);
                        targets = files;
                    }
                    for (const file of targets) {
                        try {
                            const cleanPattern = combinedPattern;
                            const cleanPath = file.replace(/"/g, '`"');
                            const res = await spawnAsync('powershell', [
                                '-NoProfile',
                                '-Command',
                                `Get-Content -Path "${cleanPath}" | Select-String -Pattern "${cleanPattern}" -Context ${contextLines} | ForEach-Object { $lineNum = $_.LineNumber; $preCount = $_.Context.PreContext.Count; for ($i = 0; $i -lt $preCount; $i++) { "${cleanPath}:$($lineNum - $preCount + $i):$($_.Context.PreContext[$i])" }; "${cleanPath}:$lineNum:$($_.Line)"; for ($i = 0; $i -lt $_.Context.PostContext.Count; $i++) { "${cleanPath}:$($lineNum + 1 + $i):$($_.Context.PostContext[$i])" } }`
                            ], 15000);
                            if (res.stdout) {
                                stdout += res.stdout + '\n';
                            }
                        } catch {
                            // ignore file read error
                        }
                    }
                } else {
                    console.warn('[ContextGatherer] Skipping PowerShell search fallback due to potential injection characters in query.');
                }
            }

            if (stdout) {
                const rawMatches = stdout.split('\n').filter(Boolean);
                
                // 8. Group by File and Deduplicate
                const grouped = new Map<string, Array<{ line: number; content: string }>>();
                const { Sanitizer } = await import('../../utils/Sanitizer.js');

                for (const match of rawMatches) {
                    if (match === '--') continue;
                    try {
                        // Strip trailing carriage return for CRLF compatibility
                        const cleanMatch = match.replace(/\r$/, '');
                        // Handle formatting: path/to/file:line:content or path/to/file-line-content
                        // Use regex to split reliably even if path contains colons or dashes
                        const parts = cleanMatch.match(/^((?:[A-Za-z]:)?[^:|]+?)[:|-](\d+)[:|-](.*)$/);
                        if (parts) {
                            const rawFilePath = parts[1];
                            const lineNum = parseInt(parts[2]);
                            const content = parts[3].trim();

                            if (!isNaN(lineNum) && content) {
                                // Strip workspace root from file path to save tokens
                                let displayPath = rawFilePath;
                                try {
                                    const normalizedRoot = workspaceRoot.replace(/\\/g, '/').toLowerCase();
                                    const normalizedPath = rawFilePath.replace(/\\/g, '/').toLowerCase();
                                    if (normalizedPath.startsWith(normalizedRoot)) {
                                        displayPath = rawFilePath.substring(normalizedRoot.length).replace(/^[\\\/]/, '').replace(/\\/g, '/');
                                    }
                                } catch {}

                                if (!grouped.has(displayPath)) grouped.set(displayPath, []);
                                const lines = grouped.get(displayPath)!;
                                if (!lines.some(l => l.line === lineNum)) {
                                    lines.push({ line: lineNum, content: Sanitizer.sanitize(content) });
                                }
                            }
                        }
                    } catch {}
                }

                // 9. Format final results with Priority Sorting
                const getPriority = (filePath: string): number => {
                    const ext = path.extname(filePath).toLowerCase();
                    const codeExts = ['.ts', '.py', '.js', '.tsx', '.jsx', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.java', '.sh', '.rb', '.php', '.cs', '.swift', '.sol', '.kt', '.dart'];
                    const configExts = ['.json', '.yml', '.yaml', '.toml', '.env', '.xml', '.ini'];
                    if (codeExts.includes(ext)) return 1;
                    if (configExts.includes(ext)) return 2;
                    return 3; // Docs and others
                };

                sortedFiles = Array.from(grouped.keys()).sort((a, b) => {
                    const prioA = getPriority(a);
                    const prioB = getPriority(b);
                    if (prioA !== prioB) return prioA - prioB;
                    return a.localeCompare(b); // Fallback to alphabetical
                });
                for (const file of sortedFiles) {
                    const lines = grouped.get(file)!.sort((a, b) => a.line - b.line);
                    const ext = path.extname(file).toLowerCase();
                    
                    if ((ext === '.log' || ext === '.json') && lines.length > 15) {
                        const threshold = parseFloat(process.env.LOG_COMPACTION_THRESHOLD || '0.82');
                        results.push(`[Context] --- FILE: ${file} ---`);
                        
                        // 1. Add head (first 5 matches)
                        const headLines = lines.slice(0, 5);
                        const middleLines = lines.slice(5, lines.length - 5);
                        const tailLines = lines.slice(lines.length - 5);

                        for (const { line, content } of headLines) {
                            const displayContent = content.length > 400 ? `${content.slice(0, 400)}... (truncated)` : content;
                            results.push(`L${line}: ${displayContent}`);
                        }

                        // Group middle lines into logical blocks (supporting multi-line braces like JSON objects or single lines)
                        interface Block {
                            lines: Array<{ line: number; content: string }>;
                            combinedContent: string;
                        }
                        
                        const blocks: Block[] = [];
                        let currentBlock: Array<{ line: number; content: string }> | null = null;
                        let lastLineNum = -1;

                        const flushCurrentBlock = () => {
                            if (!currentBlock) return;
                            // Only group contiguous lines as a single block if we are in a JSON file and the block is not composed entirely of self-contained single-line objects
                            const isAllSelfContainedJson = currentBlock.every(item => 
                                item.content.includes('{') && item.content.includes('}')
                            );
                            const shouldGroup = ext === '.json' && !isAllSelfContainedJson;

                            if (shouldGroup) {
                                blocks.push({
                                    lines: currentBlock,
                                    combinedContent: currentBlock.map(l => l.content).join('\n')
                                });
                            } else {
                                for (const item of currentBlock) {
                                    blocks.push({
                                        lines: [item],
                                        combinedContent: item.content
                                    });
                                }
                            }
                            currentBlock = null;
                        };

                        for (const item of middleLines) {
                            const content = item.content;
                            const isGap = lastLineNum !== -1 && item.line > lastLineNum + 1;
                            
                            if (isGap) {
                                flushCurrentBlock();
                                currentBlock = [item];
                            } else if (currentBlock) {
                                currentBlock.push(item);
                            } else {
                                currentBlock = [item];
                            }
                            lastLineNum = item.line;
                        }
                        flushCurrentBlock();

                        // Helper Jaccard similarity function with word-digit normalization
                        const calculateJaccard = (s1: string, s2: string): number => {
                            // Preserve embedded code snippet fields (e.g. n8n jsCode/pythonCode) by avoiding collapse
                            if (containsEmbeddedCodeField(s1) || containsEmbeddedCodeField(s2)) {
                                return 0;
                            }
                            const norm1 = s1.replace(/[a-zA-Z0-9]*\d+[a-zA-Z0-9]*/g, '#');
                            const norm2 = s2.replace(/[a-zA-Z0-9]*\d+[a-zA-Z0-9]*/g, '#');
                            const tokenize = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9_#]+/g) || []);
                            const set1 = tokenize(norm1);
                            const set2 = tokenize(norm2);
                            if (set1.size === 0 && set2.size === 0) return 1;
                            const intersection = new Set([...set1].filter(x => set2.has(x)));
                            const union = new Set([...set1, ...set2]);
                            return intersection.size / union.size;
                        };

                        // 2. Collapse middle blocks semantically
                        let i = 0;
                        while (i < blocks.length) {
                            let j = i + 1;
                            while (j < blocks.length && calculateJaccard(blocks[i].combinedContent, blocks[j].combinedContent) >= threshold) {
                                j++;
                            }
                            const runLength = j - i;
                            if (runLength > 3) {
                                let totalCollapsedLines = 0;
                                for (let k = i; k < j; k++) {
                                    totalCollapsedLines += blocks[k].lines.length;
                                }
                                results.push(`.. (${totalCollapsedLines} similar lines collapsed via semantic matching)`);
                                // Introduce randomized representation selection to capture progression/variance
                                const randIdx = i + Math.floor(Math.random() * runLength);
                                const repBlock = blocks[randIdx];
                                for (const { line, content } of repBlock.lines) {
                                    const displayContent = content.length > 400 ? `${content.slice(0, 400)}... (truncated)` : content;
                                    results.push(`L${line}: ${displayContent}`);
                                }
                            } else {
                                for (let k = i; k < j; k++) {
                                    for (const { line, content } of blocks[k].lines) {
                                        const displayContent = content.length > 400 ? `${content.slice(0, 400)}... (truncated)` : content;
                                        results.push(`L${line}: ${displayContent}`);
                                    }
                                }
                            }
                            i = j;
                        }

                        // 3. Add tail
                        for (const { line, content } of tailLines) {
                            const displayContent = content.length > 400 ? `${content.slice(0, 400)}... (truncated)` : content;
                            results.push(`L${line}: ${displayContent}`);
                        }
                    } else {
                        results.push(`[Context] --- FILE: ${file} ---`);
                        for (const { line, content } of lines) {
                            const displayContent = content.length > 400 ? `${content.slice(0, 400)}... (truncated)` : content;
                            results.push(`L${line}: ${displayContent}`);
                        }
                    }
                }
            }
        } catch (e: any) {
            // Handle no matches found error (rg/grep exit code 1)
        }

        if (!isTheoretical) {
            await enrichWithGraph(workspaceRoot, sortedFiles, query, results, options.modelId);
        }

        // Cache results
        contextCache.set(cacheKey, { results, timestamp: Date.now(), branch });

        const grepElapsedMs = Date.now() - grepStartMs;
        const sessionId = options.sessionId;
        if (sessionId) {
            try {
                const homedir = os.homedir();
                const projectsDir = path.join(homedir, '.free-llm-mcp', 'projects');
                const entry = JSON.stringify({
                    ts: new Date().toISOString(),
                    sessionId,
                    type: 'grep_execution',
                    tool,
                    query: combinedPattern,
                    resultCount: results.length,
                    elapsedMs: grepElapsedMs,
                    cacheHit: false
                }) + '\n';
                await fs.appendFile(path.join(projectsDir, sessionId, 'agentic-debug.log'), entry, 'utf-8');
            } catch {}
        }

        return results;
    }
}

export async function enrichWithGraph(
    workspaceRoot: string,
    matchedFiles: string[],
    query: string,
    results: string[],
    modelId?: string
): Promise<void> {
    try {
        const graphPath = path.join(workspaceRoot, '.free-llm-mcp', 'repo_graph.json');
        const graphData = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
        const { RepositoryGraph, semanticScore } = await import('../../memory/dependency-scanner.js');
        const graph = RepositoryGraph.deserialize(workspaceRoot, graphData);

        // 1. Find semantically related nodes by keyword scoring
        const scored = semanticScore(query, graph, false, 4);
        const graphFiles = scored
            .map(s => s.node.id)
            .filter(id => !matchedFiles.includes(id));

        // 2. For each matched grep file, get 1-hop neighbours
        for (const mf of matchedFiles.slice(0, 3)) {
            const nb = graph.getNeighborhood(mf, 1);
            nb.nodes
                .filter(n => n.type === 'code' && n.id !== mf)
                .forEach(n => { if (!graphFiles.includes(n.id)) graphFiles.push(n.id); });
        }

        // 3. Read and inject additional files as condensed snippets
        const { getModelContextLimit } = await import('../../utils/model-tokens.js');
        const contextLimit = getModelContextLimit(modelId);

        let maxGraphFiles = 3;
        let graphFileMaxTokens = 250;

        if (contextLimit >= 1000000) {
            maxGraphFiles = 5;
            graphFileMaxTokens = 500;
        } else if (contextLimit >= 128000) {
            maxGraphFiles = 4;
            graphFileMaxTokens = 350;
        } else if (contextLimit < 32000) {
            maxGraphFiles = 2;
            graphFileMaxTokens = 150;
        }

        const injected: string[] = [];
        const { surgicalRead } = await import('../../utils/surgical-read.js');
        for (const relFile of graphFiles.slice(0, maxGraphFiles)) {
            try {
                const fullPath = path.resolve(workspaceRoot, relFile);
                const preview = await surgicalRead(fullPath, query, { maxTokens: graphFileMaxTokens });
                if (preview) {
                    injected.push(
                        `[Graph-Context] --- RELATED FILE: ${relFile} (via dep-graph) ---\n${preview}`
                    );
                }
            } catch { /* file may have been deleted or doesn't exist */ }
        }

        results.push(...injected);
    } catch (err) {
        // repo_graph.json not built or other error, ignore and let grep return directly
    }
}

