import { spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { WorkspaceWalker } from './workspace-walker.js';
import fs from 'fs/promises';
import { DiffScanner } from './diff-scanner.js';
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import { FIELD_LANGUAGE_MAP } from '../../memory/embedded-snippet-scanner.js';

const EMBEDDED_CODE_FIELD_PATTERNS = Object.keys(FIELD_LANGUAGE_MAP).map(f => new RegExp(`"${f}"\\s*:`, 'i'));
const containsEmbeddedCodeField = (s: string): boolean => EMBEDDED_CODE_FIELD_PATTERNS.some(pat => pat.test(s));

/**
 * Robust spawn wrapper for cross-platform command execution.
 */
function spawnAsync(command: string, args: string[], timeoutMs = 10000): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const useShell = process.platform === 'win32' && command.endsWith('.cmd');
        const child = spawn(command, args, { shell: useShell });
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

/** Test-only: clears the module-level LRU cache to prevent cross-test contamination */
export function __test_clearCache(): void {
    contextCache.clear();
}

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

        // 4. Extract terms from query, with typo correction & security audit expansion
        const terms = new Set<string>();
        if (options.keywords && Array.isArray(options.keywords)) {
            options.keywords.forEach(k => {
                if (k && typeof k === 'string') terms.add(k.trim());
            });
        }

        // Normalize common typos and abbreviations
        let normalizedQuery = query.toLowerCase()
            .replace(/\bcrictial\b|\bcrtical\b/g, 'critical')
            .replace(/\bvulnerabilites\b|\bvuln\b|\bvulns\b/g, 'vulnerability')
            .replace(/\boccured\b/g, 'occurred');

        const manifestDependencies = new Set<string>();
        const vulnerableDeps = new Set<string>();
        const advisories: AdvisoryInfo[] = [];
        // Universal Multi-Language Manifest Dependency Resolution: if audit/vulnerability/security & override/dependencies present
        const isAuditQuery = /\b(audit|vulnerability|security|dependency|dependencies)\b/i.test(normalizedQuery) && /\b(override|node_modules|vendor|deps|site-packages|pkg)\b/i.test(normalizedQuery);
        if (isAuditQuery) {
            await Promise.all([
                resolveManifestDependencies(workspaceRoot, manifestDependencies, vulnerableDeps),
                resolveAuditVulnerabilities(workspaceRoot, manifestDependencies, vulnerableDeps, advisories)
            ]);
        }

        const fileRefMatches = normalizedQuery.match(/\b[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+\b/g) || [];
        fileRefMatches.forEach(f => terms.add(f.toLowerCase()));
        
        const rawTerms = normalizedQuery.match(/\w+/g) || [];
        const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'are', 'was', 'were', 'which', 'about', 'into', 'lets', 'see', 'how', 'why', 'could', 'would', 'should']);
        for (const term of rawTerms) {
            if (term.length > 2 && !stopwords.has(term)) {
                terms.add(term);
            }
        }

        // 3c. Extract code blocks & inline code
        const codeBlocks = query.match(/```[\s\S]*?```/g) || [];
        codeBlocks.forEach(block => {
            block.split(/\W+/).filter(t => t.length > 5).forEach(t => terms.add(t));
        });

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

        // Real audit-discovered vulnerable package names always survive the term cap so the
        // grep pass is guaranteed to target the actual culprit, not just generic query words.
        const auditPkgNames = Array.from(vulnerableDeps);
        const remainingTermSlots = Math.max(8 - auditPkgNames.length, 0);
        const finalTerms = Array.from(new Set([...auditPkgNames, ...Array.from(terms).slice(0, remainingTermSlots)]));
        if (finalTerms.length === 0) return [];

        // 4. Combine terms into a single regex pattern for efficiency
        const combinedPattern = finalTerms.join('|');

        const { detectPersona } = await import('../../utils/persona-detector.js');
        const persona = detectPersona(query, workspaceRoot);

        const isTheoretical = /\b(doc|documentation|guide|explain|theory|writeup|summary|overview)\b/i.test(query) || persona === 'student' || persona === 'researcher';
        const overrideIgnores = /\b(override|all files|gitignored|ignored)\b/i.test(query);

        // 5. Rank Candidates with priorityFiles support
        const candidateLimit = Math.max(limit * 3, 25);
        let candidates = await WorkspaceWalker.findRelevantFiles(workspaceRoot, Array.from(terms), candidateLimit, overrideIgnores, isTheoretical, priorityFiles, Array.from(manifestDependencies), Array.from(vulnerableDeps));
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
            const isLogOrJsonSearch = candidates.some(f => /\.(log|json|md|txt)$/i.test(f)) || /\.(log|json|md|txt)\b/i.test(query);
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
                // Windows PowerShell Get-Content fallback - only run if pattern is safe
                if (/^[a-zA-Z0-9_\-|\.\s\\\/:]+$/.test(combinedPattern)) {
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

            if (!stdout && candidates.length > 0) {
                // When keyword search yields no matches, read top candidates directly
                const topCandidates = candidates.slice(0, 10);
                for (const file of topCandidates) {
                    try {
                        const content = await fs.readFile(file, 'utf-8');
                        const lines = content.split('\n').slice(0, 50);
                        const fileMatches = lines.map((line, idx) => `${file}:${idx + 1}:${line}`);
                        stdout += fileMatches.join('\n') + '\n';
                    } catch {}
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
                const queryLower = query.toLowerCase();
                const getPriority = (filePath: string): number => {
                    const norm = filePath.replace(/\\/g, '/').toLowerCase();
                    const base = path.basename(norm);
                    // Explicit filename match in user query -> Priority 0 (highest)
                    if (queryLower.includes(base)) return 0;
                    // Main source folder match (src/, lib/, app/) -> Priority 0.5
                    if (norm.startsWith('src/') || norm.startsWith('lib/') || norm.startsWith('app/')) return 0.5;

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
                    
                    if ((ext === '.log' || ext === '.json' || ext === '.md' || ext === '.txt') && lines.length > 8) {
                        const defaultThreshold = (ext === '.md' || ext === '.txt') ? '0.55' : '0.82';
                        const threshold = parseFloat(process.env.LOG_COMPACTION_THRESHOLD || defaultThreshold);
                        results.push(`[Context] --- FILE: ${file} ---`);
                        
                        // 1. Add head (first 2-5 matches based on file size)
                        const headCount = lines.length > 25 ? 5 : (lines.length > 12 ? 3 : 2);
                        const tailCount = lines.length > 25 ? 5 : (lines.length > 12 ? 3 : 2);
                        const headLines = lines.slice(0, headCount);
                        const middleLines = lines.slice(headCount, Math.max(headCount, lines.length - tailCount));
                        const tailLines = lines.slice(Math.max(headCount, lines.length - tailCount));

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
                            const shouldGroup = false;

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
                            // Preserve markdown headers (#, ##, ###) and embedded code snippet fields
                            if (s1.trim().startsWith('#') || s2.trim().startsWith('#')) {
                                return 0;
                            }
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
                            const minRunLength = 1;
                            if (runLength > minRunLength) {
                                let totalCollapsedLines = 0;
                                for (let k = i; k < j; k++) {
                                    totalCollapsedLines += blocks[k].lines.length;
                                }
                                results.push(`.. (${totalCollapsedLines} similar lines collapsed via semantic matching)`);
                                // Use deterministic first block representation to guarantee anchor presence
                                const repBlock = blocks[i];
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

        if (advisories.length > 0) {
            const advisoryBlocks = advisories.map(a => {
                const lines = [`[Audit-Context] --- ADVISORY: ${a.name} (${a.severity}) ---`, `Title: ${a.title}`];
                if (a.range) lines.push(`Vulnerable range: ${a.range}`);
                if (a.url) lines.push(`Reference: ${a.url}`);
                if (a.path) lines.push(`Dependency path: ${a.path}`);
                return lines.join('\n');
            });
            results.unshift(...advisoryBlocks);
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

/**
 * Universal Multi-Language Manifest Dependency Resolver
 * Dynamically resolves declared dependencies across ecosystems:
 * - Node.js (package.json)
 * - Python (requirements.txt, pyproject.toml, Pipfile)
 * - Rust (Cargo.toml)
 * - Go (go.mod)
 * - Ruby (Gemfile)
 * - PHP (composer.json)
 */
async function resolveManifestDependencies(
    workspaceRoot: string, 
    manifestDeps: Set<string>,
    vulnerableDeps?: Set<string>
): Promise<void> {
    // 1. Node.js (package.json)
    try {
        const pkgPath = path.join(workspaceRoot, 'package.json');
        const pkgRaw = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw);
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
        deps.forEach(dep => {
            const parts = dep.split('/');
            parts.forEach(part => {
                const clean = part.replace(/^@/, '');
                if (clean.length > 2) manifestDeps.add(clean.toLowerCase());
            });
        });
        const overrides = Object.keys({ ...pkg.overrides, ...pkg.resolutions });
        overrides.forEach(dep => {
            const parts = dep.split('/');
            parts.forEach(part => {
                const clean = part.replace(/^@/, '');
                if (clean.length > 2) {
                    manifestDeps.add(clean.toLowerCase());
                    if (vulnerableDeps) vulnerableDeps.add(clean.toLowerCase());
                }
            });
        });
    } catch {}

    // 1b. Node.js Lockfile (package-lock.json)
    try {
        const lockPath = path.join(workspaceRoot, 'package-lock.json');
        const lockRaw = await fs.readFile(lockPath, 'utf-8');
        const lock = JSON.parse(lockRaw);
        if (lock.packages) {
            Object.keys(lock.packages).forEach(pkgPath => {
                const dep = pkgPath.replace(/^node_modules\//, '');
                if (dep && dep !== workspaceRoot) {
                    const parts = dep.split('/');
                    parts.forEach(part => {
                        const clean = part.replace(/^@/, '');
                        if (clean.length > 2) manifestDeps.add(clean.toLowerCase());
                    });
                }
            });
        }
    } catch {}

    // 2. Python (requirements.txt, pyproject.toml)
    try {
        const reqPath = path.join(workspaceRoot, 'requirements.txt');
        const reqRaw = await fs.readFile(reqPath, 'utf-8');
        reqRaw.split('\n').forEach(line => {
            const match = line.trim().match(/^([a-zA-Z0-9_-]+)/);
            if (match && match[1].length > 2 && !match[1].startsWith('#')) {
                manifestDeps.add(match[1].toLowerCase());
            }
        });
    } catch {}

    try {
        const pyprojPath = path.join(workspaceRoot, 'pyproject.toml');
        const pyprojRaw = await fs.readFile(pyprojPath, 'utf-8');
        const matches = pyprojRaw.match(/["']([a-zA-Z0-9_-]+)(?:[~=>!<].*)?["']/g) || [];
        matches.forEach(m => {
            const clean = m.replace(/["']/g, '').split(/[~=>!<]/)[0].trim();
            if (clean.length > 2) manifestDeps.add(clean.toLowerCase());
        });
    } catch {}

    // 3. Rust (Cargo.toml)
    try {
        const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
        const cargoRaw = await fs.readFile(cargoPath, 'utf-8');
        const matches = cargoRaw.match(/^([a-zA-Z0-9_-]+)\s*=/gm) || [];
        matches.forEach(m => {
            const name = m.split('=')[0].trim();
            if (name.length > 2 && name !== 'name' && name !== 'version' && name !== 'edition') {
                manifestDeps.add(name.toLowerCase());
            }
        });
    } catch {}

    // 4. Go (go.mod)
    try {
        const goModPath = path.join(workspaceRoot, 'go.mod');
        const goModRaw = await fs.readFile(goModPath, 'utf-8');
        const matches = goModRaw.match(/^\s*([a-zA-Z0-9_\-.\/]+)\s+v[0-9]/gm) || [];
        matches.forEach(m => {
            const pkg = m.trim().split(/\s+/)[0].split('/').pop();
            if (pkg && pkg.length > 2) manifestDeps.add(pkg.toLowerCase());
        });
    } catch {}

    // 5. Ruby (Gemfile)
    try {
        const gemPath = path.join(workspaceRoot, 'Gemfile');
        const gemRaw = await fs.readFile(gemPath, 'utf-8');
        const matches = gemRaw.match(/gem\s+["']([a-zA-Z0-9_-]+)["']/g) || [];
        matches.forEach(m => {
            const name = m.replace(/gem\s+["']|["']/g, '').trim();
            if (name.length > 2) manifestDeps.add(name.toLowerCase());
        });
    } catch {}

    // 6. PHP (composer.json)
    try {
        const compPath = path.join(workspaceRoot, 'composer.json');
        const compRaw = await fs.readFile(compPath, 'utf-8');
        const comp = JSON.parse(compRaw);
        const deps = Object.keys({ ...comp.require, ...comp['require-dev'] });
        deps.forEach(dep => {
            const cleanDep = dep.split('/').pop();
            if (cleanDep && cleanDep.length > 2 && cleanDep !== 'php') manifestDeps.add(cleanDep.toLowerCase());
        });
    } catch {}
}

export interface AdvisoryInfo {
    name: string;
    severity: string;
    title: string;
    url?: string;
    range?: string;
    path?: string;
}

/**
 * Runs `npm audit --json` against the workspace and resolves the real, currently-flagged
 * vulnerable package names + advisory details. No package names are hardcoded — everything
 * comes from npm's own audit database for whatever is actually installed/locked.
 */
async function resolveAuditVulnerabilities(
    workspaceRoot: string,
    manifestDeps: Set<string>,
    vulnerableDeps: Set<string>,
    advisories: AdvisoryInfo[]
): Promise<void> {
    try {
        const hasPkgJson = await fs.access(path.join(workspaceRoot, 'package.json')).then(() => true).catch(() => false);
        if (!hasPkgJson) return;

        const useShell = process.platform === 'win32';
        let stdout = '';
        try {
            const res = await spawnAsync(useShell ? 'npm.cmd' : 'npm', ['audit', '--json'], 20000);
            stdout = res.stdout;
        } catch (e: any) {
            // `npm audit` exits non-zero when vulnerabilities are found; spawnAsync only
            // resolves on 0/1, so any other rejection may still carry usable JSON on stdout
            // if npm printed before erroring. Nothing else we can do here - bail gracefully.
            return;
        }

        if (!stdout) return;
        const report = JSON.parse(stdout);
        const vulns = report?.vulnerabilities;
        if (!vulns || typeof vulns !== 'object') return;

        for (const [pkgName, info] of Object.entries<any>(vulns)) {
            if (!pkgName) continue;
            const clean = pkgName.replace(/^@/, '').toLowerCase();
            vulnerableDeps.add(clean);
            manifestDeps.add(clean);

            const severity = info?.severity || 'unknown';
            const range = info?.range;
            const via = Array.isArray(info?.via) ? info.via : [];
            const nodePath = Array.isArray(info?.nodes) && info.nodes.length > 0 ? info.nodes[0] : undefined;

            const namedVia = via.filter((v: any) => v && typeof v === 'object');
            if (namedVia.length > 0) {
                for (const v of namedVia) {
                    advisories.push({
                        name: pkgName,
                        severity,
                        title: v.title || `${pkgName} vulnerability`,
                        url: v.url,
                        range,
                        path: nodePath
                    });
                }
            } else {
                advisories.push({ name: pkgName, severity, title: `${pkgName} vulnerability`, range, path: nodePath });
            }
        }
    } catch {
        // offline, no lockfile, non-npm project, or malformed JSON - fall back silently to heuristics
    }
}

