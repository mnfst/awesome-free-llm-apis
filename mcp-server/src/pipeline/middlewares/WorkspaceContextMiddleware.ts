import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import type { Middleware, PipelineContext, NextFunction } from '../middleware.js';
import { memoryManager } from '../../memory/index.js';
import { WorkspaceScanner } from '../../cache/workspace.js';
import { getIntelligentSystemPrompt } from './prompts.js';
import { ContextGatherer } from './context-gatherer.js';
import { WorkspaceIndexer } from '../../memory/indexer.js';
import { getMessageContent, prependToMessageContent, appendToMessageContent } from '../../utils/MessageUtils.js';
import { GithubRepoScanner, GLOBAL_CYBER_WIKI_NS } from '../../utils/GithubRepoScanner.js';
import { CYBER_TERMS_REGEX } from '../../utils/TaskClassifier.js';
import { taskTypeToPersona } from '../../utils/PersonaMapper.js';
import { EXCLUDE_DIRS, EXCLUDE_EXTENSIONS } from './constants.js';

const workspaceScanner = new WorkspaceScanner(process.cwd());

/**
 * Generates a clean, lightweight directory tree (up to 2 levels deep, max 30 entries)
 * filtering out cache hashes, temporary files, data dirs, and build artifacts to prevent token bloat.
 */
async function getDirectoryTree(dirPath: string, maxDepth = 2, currentDepth = 0, state = { count: 0 }, maxEntries = 30): Promise<string> {
    if (currentDepth > maxDepth || state.count >= maxEntries) return '';
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        let tree = '';
        const indent = '  '.repeat(currentDepth);

        const filtered = entries.filter(entry => {
            const name = entry.name;
            if (name.startsWith('.') && name !== '.env' && name !== '.env.example') return false;
            if (EXCLUDE_DIRS.includes(name) || ['data', 'cache', 'temp', 'tmp', 'projects', 'scrapes'].includes(name)) return false;
            const ext = path.extname(name).toLowerCase();
            if (EXCLUDE_EXTENSIONS.includes(ext) || ext === '.tmp' || ext === '.lock' || ext === '.log') return false;
            return true;
        });

        for (const entry of filtered) {
            if (state.count >= maxEntries) {
                tree += `${indent}... [tree truncated for concise context]\n`;
                break;
            }
            tree += `${indent}- ${entry.name}${entry.isDirectory() ? '/' : ''}\n`;
            state.count++;
            if (entry.isDirectory()) {
                tree += await getDirectoryTree(path.join(dirPath, entry.name), maxDepth, currentDepth + 1, state, maxEntries);
            }
        }
        return tree;
    } catch {
        return '';
    }
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractUsageAndDocstrings(content: string, commands: string[]): string {
    const lines = content.split('\n');
    let output = '';
    
    // 1. Identify and extract lines with specific options/examples
    const examples: string[] = [];
    const commandRegexes = commands.map(cmd => new RegExp(`\\b${escapeRegExp(cmd)}\\b.*?(?:-[a-zA-Z]|--[a-z])`, 'i'));
    
    for (const line of lines) {
        if (/(license|copyright|copyrighted|download|mailing list|installing|contributing|build status)/i.test(line)) {
            continue;
        }
        for (const regex of commandRegexes) {
            if (regex.test(line)) {
                examples.push(line.trim());
                break;
            }
        }
    }
    
    if (examples.length > 0) {
        output += `### Command Usage Examples:\n` + examples.slice(0, 10).map(e => `  - ${e}`).join('\n') + '\n';
    }

    // 2. Identify sections related to Usage, Examples, or Options
    let currentSection = '';
    let captureSection = false;
    let sectionLines: string[] = [];
    
    for (const line of lines) {
        const isHeader = line.startsWith('#');
        if (isHeader) {
            if (captureSection && sectionLines.length > 0) {
                output += `\n### Section: ${currentSection}\n` + sectionLines.slice(0, 15).join('\n') + '\n';
            }
            currentSection = line.replace(/^#+\s*/, '').trim();
            captureSection = /(usage|example|option|argument|parameter|flag|help|syntax)/i.test(currentSection) && 
                             !/(license|download|installation|building|compil)/i.test(currentSection);
            sectionLines = [];
        } else if (captureSection) {
            if (line.trim()) {
                sectionLines.push(line.trim());
            }
        }
    }
    if (captureSection && sectionLines.length > 0) {
        output += `\n### Section: ${currentSection}\n` + sectionLines.slice(0, 15).join('\n') + '\n';
    }

    // 3. Extract code blocks with the commands
    const codeBlockRegex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
    let match;
    const blocks: string[] = [];
    while ((match = codeBlockRegex.exec(content)) !== null) {
        const blockContent = match[1];
        if (commands.some(cmd => new RegExp(`\\b${escapeRegExp(cmd)}\\b`, 'i').test(blockContent))) {
            blocks.push(blockContent.trim());
        }
    }
    if (blocks.length > 0) {
        output += `\n### Usage Code Blocks:\n` + blocks.slice(0, 3).map(b => `\`\`\`\n${b}\n\`\`\``).join('\n\n') + '\n';
    }

    return output;
}

function extractProjectDescription(readme: string): string {
    const lines = readme.split('\n');
    let description = '';
    let foundTitle = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#') || line.startsWith('===')) {
            foundTitle = true;
            continue;
        }
        
        if (foundTitle && line.length > 5) {
            if (/badge\.svg|travis-ci|github\.com\/.*\/actions/i.test(line)) continue;
            if (/copyright|license|released under|compatible with GPL|free usage|commercial license/i.test(line)) continue;
            if (/install|download|mailing list|support/i.test(line)) continue;
            
            description = line;
            let j = i + 1;
            while (j < lines.length && lines[j].trim().length > 0 && !lines[j].trim().startsWith('#')) {
                description += ' ' + lines[j].trim();
                j++;
            }
            break;
        }
    }
    
    return description.trim();
}

function extractCommandsFromPrompt(prompt: string, repo: string): string[] {
    const commands = new Set<string>();
    commands.add(repo.toLowerCase());
    
    const knownCommands = ['nmap', 'sqlmap', 'hydra', 'gobuster', 'nikto', 'hashcat', 'john', 'pytest', 'git', 'curl', 'wget'];
    const promptLower = prompt.toLowerCase();
    for (const cmd of knownCommands) {
        if (new RegExp(`\\b${escapeRegExp(cmd)}\\b`, 'i').test(promptLower)) {
            commands.add(cmd);
        }
    }
    
    const words = prompt.split(/\s+/);
    for (const word of words) {
        const clean = word.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (clean.length > 2 && !['and', 'for', 'run', 'the', 'use', 'git', 'github'].includes(clean)) {
            if (/^[a-z0-9_-]+$/.test(clean)) {
                if (promptLower.includes(`run ${clean}`) || 
                    promptLower.includes(`${clean} scan`) || 
                    promptLower.includes(`${clean} test`) ||
                    promptLower.includes(`${clean} command`)) {
                    commands.add(clean);
                }
            }
        }
    }
    return [...commands];
}

function getCleanUserPrompt(content: string): string {
    let clean = content;
    clean = clean.replace(/## 🧠 WORKSPACE MEMORY[\s\S]*?<\/memory_context_isolation_gate>/g, '');
    clean = clean.replace(/## 📋 TARGET PROJECT GUIDELINES[\s\S]*?<\/target_project_guidelines_isolation_gate>/g, '');
    clean = clean.replace(/## 📂 WORKSPACE CONTEXT[\s\S]*?<\/workspace_context_isolation_gate>/g, '');
    clean = clean.replace(/## 🌐 GITHUB REPOSITORY CONTEXT[\s\S]*?<\/github_repo_context_gate>/g, '');
    clean = clean.replace(/## 🛠️ CODEBASE COMMAND USAGES[\s\S]*/g, '');
    return clean;
}

/**
 * WorkspaceContextMiddleware - Handles workspace-aware context injection.
 * 
 * This middleware resolves the workspace hash, searches for relevant memory,
 * gathers grep context, and injects the intelligent system prompt.
 * 
 * It runs regardless of the 'agentic' flag as long as a workspace or session is provided,
 * fulfilling the requirement that memory should be active even for non-agentic requests.
 */
export class WorkspaceContextMiddleware implements Middleware {
    name = 'WorkspaceContextMiddleware';

    async execute(context: PipelineContext, next: NextFunction): Promise<void> {
        const startMs = Date.now();
        const sessionId = context.sessionId;
        const userMessage = context.request.messages.find(m => m.role === 'user');
        let userContent = userMessage ? (typeof userMessage.content === 'string' ? userMessage.content : JSON.stringify(userMessage.content)) : '';
        const isAgentic = context.request.agentic === true;

        // Check if this is a vision/multimodal task (contains images or is routed as vision)
        const isVision = context.taskType === 'vision' || context.request.messages.some(m => 
            Array.isArray(m.content) && m.content.some((item: any) => item && typeof item === 'object' && item.type === 'image_url')
        );

        if (isVision) {
            console.debug(`[WorkspaceContextMiddleware] Vision/multimodal task detected. Skipping workspace text context injection to prevent context bloat.`);
            await next();
            return;
        }

        // Check for Github URL in user prompt
        if (userContent) {
            const cleanPrompt = getCleanUserPrompt(userContent);
            const githubUrlRegex = /https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/;
            const match = githubUrlRegex.exec(cleanPrompt);
            if (match) {
                const url = match[0];
                try {
                    const { owner, repo, branch } = GithubRepoScanner.parseUrl(url);
                    const readme = await GithubRepoScanner.fetchRawContent(owner, repo, 'README.md', branch);
                    const analysis = GithubRepoScanner.analyzeCode(readme);
                    
                    const commands = extractCommandsFromPrompt(cleanPrompt, repo);
                    const usageDocs = extractUsageAndDocstrings(readme, commands.length > 0 ? commands : [repo]);

                    // Perform remote tree scan and code analysis
                    const repoScan = await GithubRepoScanner.scanRepoCode(owner, repo, branch, commands, cleanPrompt);

                    const isCodeAnalysisQuery = /(analyze|trace|dataflow|dependencies|architecture|code|function|flow|structure|how it works)/i.test(cleanPrompt);
                    const isTreeRequested = /(tree|files|structure|directory|list files)/i.test(cleanPrompt);

                    let githubContext = `\n\n## 🌐 GITHUB REPOSITORY CONTEXT\n`;
                    githubContext += `Repository: ${owner}/${repo}\n`;
                    if (usageDocs) {
                        githubContext += `${usageDocs}\n`;
                    } else {
                        const description = extractProjectDescription(readme);
                        if (description && description.length > 20) {
                            githubContext += `Description: ${description}\n`;
                        } else {
                            githubContext += `Description: Remote repository tree and command flags scanned dynamically below.\n`;
                        }
                    }

                    if (repoScan.treeSummary.length > 0 && (isCodeAnalysisQuery || isTreeRequested)) {
                        githubContext += `\n### Repository Files Tree (Subset):\n${repoScan.treeSummary.map(p => `  - ${p}`).join('\n')}\n`;
                    }

                    if (repoScan.scannedFiles.length > 0) {
                        githubContext += `\n### Scanned Files Analysis:\n`;
                        for (const sf of repoScan.scannedFiles) {
                            githubContext += `#### File: ${sf.path}\n`;
                            
                            if (sf.flags && sf.flags.length > 0) {
                                githubContext += `  - Flags: ${sf.flags.join(', ')}\n`;
                            }

                            if (isCodeAnalysisQuery) {
                                if (sf.dependencies.length > 0) {
                                    githubContext += `  - Dependencies: ${sf.dependencies.join(', ')}\n`;
                                }
                                if (sf.functions.length > 0) {
                                    githubContext += `  - Functions: ${sf.functions.join(', ')}\n`;
                                }
                                if (sf.flow.length > 0) {
                                    githubContext += `  - Flow:\n${sf.flow.map(f => `    * ${f}`).join('\n')}\n`;
                                }
                            }
                        }
                    }

                    if (isCodeAnalysisQuery) {
                        if (analysis.dependencies.length > 0) {
                            githubContext += `README Dependencies: ${analysis.dependencies.join(', ')}\n`;
                        }
                        if (analysis.functions.length > 0) {
                            githubContext += `README Functions: ${analysis.functions.join(', ')}\n`;
                        }
                        if (analysis.flow.length > 0) {
                            githubContext += `README Flow:\n${analysis.flow.map(f => `  - ${f}`).join('\n')}\n`;
                        }
                    }

                    // Check for matched commands inside readme
                    const commandUsages: string[] = [];
                    for (const cmd of commands) {
                        const lines = readme.split('\n');
                        const matches = lines.filter(l => {
                            const trimmed = l.trim();
                            if (!new RegExp(`\\b${escapeRegExp(cmd)}\\b`, 'i').test(trimmed)) return false;
                            if (/(license|copyright|copyrighted|download|mailing list|installing|contributing|build status|badge\.svg)/i.test(trimmed)) return false;
                            return true;
                        });
                        if (matches.length > 0) {
                            commandUsages.push(`Command '${cmd}' in README:\n` + matches.slice(0, 3).map(m => `  - ${m.trim()}`).join('\n'));
                        }
                    }
                    if (commandUsages.length > 0) {
                        githubContext += `\n### Command Usages in Repo:\n${commandUsages.join('\n')}\n`;
                    }

                    // Cyber tools global wiki: persist discovered GitHub security tools into a
                    // shared, cross-workspace wiki namespace so knowledge isn't siloed per project.
                    if (CYBER_TERMS_REGEX.test(cleanPrompt)) {
                        try {
                            const summary = usageDocs || extractProjectDescription(readme) || `GitHub repository ${owner}/${repo}.`;
                            await memoryManager.getWiki(GLOBAL_CYBER_WIKI_NS).write(
                                `${owner}/${repo}`,
                                summary,
                                ['cyber', 'github-tool', repo.toLowerCase()],
                                [url]
                            );
                        } catch (err) {
                            console.error(`[WorkspaceContextMiddleware] Cyber wiki write failed: ${err}`);
                        }
                    }

                    if (userMessage) {
                        appendToMessageContent(userMessage, githubContext);
                        userContent = getMessageContent(userMessage);
                    }
                } catch (err) {
                    console.error(`[WorkspaceContextMiddleware] Github scan failed: ${err}`);
                }
            }

            // Codebase tree scanning for command usages
            const commandRegex = /\b(nmap|sqlmap|hydra|gobuster|nikto|hashcat|john|pytest)\b/gi;
            const commands = [...new Set(cleanPrompt.match(commandRegex))];
            if (commands.length > 0 && context.workspaceRoot) {
                let usagesContext = `\n\n## 🛠️ CODEBASE COMMAND USAGES\n`;
                let hasUsages = false;
                for (const cmd of commands) {
                    try {
                        const results = await ContextGatherer.gatherContext({
                            workspaceRoot: context.workspaceRoot,
                            query: `"${cmd}"` || cmd,
                            limit: 5
                        });
                        if (results && results.length > 0) {
                            hasUsages = true;
                            usagesContext += `### Usages of '${cmd}':\n`;
                            usagesContext += results.join('\n') + '\n';
                        }
                    } catch {}
                }
                if (hasUsages && userMessage) {
                    appendToMessageContent(userMessage, usagesContext);
                    userContent = getMessageContent(userMessage);
                }
            }
        }


        // Dynamic budget calculation based on model capacity
        const { getModelContextLimit } = await import('../../utils/model-tokens.js');
        const model = context.request.model;
        const contextLimit = getModelContextLimit(model);

        let memorySliceCount = 4;
        let memoryCharLimit = 1500;
        let grepCharLimit = 4000;

        if (contextLimit >= 1000000) {
            memorySliceCount = 10;
            memoryCharLimit = 4000;
            grepCharLimit = 15000;
        } else if (contextLimit >= 128000) {
            memorySliceCount = 7;
            memoryCharLimit = 3000;
            grepCharLimit = 10000;
        } else if (contextLimit < 32000) {
            memorySliceCount = 2;
            memoryCharLimit = 800;
            grepCharLimit = 1500;
        }

        // 1. Resolve Workspace Hash
        if (context.workspaceRoot && !context.wsHash) {
            try {
                context.wsHash = await workspaceScanner.getWorkspaceHash(context.workspaceRoot);
            } catch (err) {
                console.error(`[WorkspaceContextMiddleware] Failed to derive workspace hash: ${err}`);
            }
        }

        // 0+1b. Pre-emptive workspace indexing followed by wiki maintenance, backgrounded
        // together so neither adds latency to the response. Wiki maintenance depends on
        // indexing having already refreshed repo_graph.json, so they run in this order
        // inside one setImmediate rather than as two separately-scheduled passes.
        if (isAgentic && context.workspaceRoot && !(context.request as any).skipIndexing) {
            const workspaceRoot = context.workspaceRoot;
            const wsHash = context.wsHash;
            setImmediate(async () => {
                try {
                    console.debug(`[WorkspaceContextMiddleware] Pre-emptive indexing for agentic task in ${workspaceRoot}`);
                    const indexer = new WorkspaceIndexer(workspaceRoot);
                    // Run indexer with force=false to respect caches but ensure latest files are present
                    await indexer.indexWorkspace(workspaceRoot, false);
                } catch (err) {
                    console.error(`[WorkspaceContextMiddleware] Pre-emptive indexing failed: ${err}`);
                }

                try {
                    const { runWikiMaintenance } = await import('../../memory/wiki-maintainer.js');
                    await runWikiMaintenance(workspaceRoot, wsHash);
                } catch (err) {
                    console.error(`[WorkspaceContextMiddleware] Wiki maintenance failed: ${err}`);
                }
            });
        }

        // 2. Gather Grep Context (TF-IDF style) and Directory Structure
        let grepResults: string[] = [];
        let dirTree = '';
        if (context.workspaceRoot && userContent) {
            try {
                dirTree = await getDirectoryTree(context.workspaceRoot);
                const queryKeywords = (context.keywords && context.keywords.length > 0)
                    ? context.keywords
                    : (userContent ? (userContent.toLowerCase().match(/\b[a-z]{3,}\b/g)?.filter(w => !['the','and','for','with','from','that','this','have','are','was','were','lets','check','please','could','would','should'].includes(w)).slice(0, 8) || []) : []);
                grepResults = await ContextGatherer.gatherContext({
                    workspaceRoot: context.workspaceRoot,
                    query: userContent,
                    keywords: queryKeywords,
                    modelId: model
                });
            } catch (err) {
                console.error(`[WorkspaceContextMiddleware] Context gathering failed: ${err}`);
            }
        }

        // 3. Search Vector Memory with Priority Sorting
        let memoryContext: string | undefined;
        const allowMemory = context.isOnePass ? !!context.workspaceRoot : true;

        if (allowMemory) {
            const memoryNamespace = context.wsHash 
                ? context.wsHash 
                : (!context.isOnePass ? context.sessionId : undefined);

            if (memoryNamespace) {
                try {
                    const queryForMemory = userContent + (grepResults.length > 0 ? ' ' + grepResults.join(' ').slice(0, 500) : '');
                    const memoryResults = await memoryManager.search(memoryNamespace, queryForMemory);
                
                if (Array.isArray(memoryResults) && memoryResults.length > 0) {
                    // Priority function consistent with ContextGatherer
                    const getPriority = (filePath?: string): number => {
                        if (!filePath) return 3;
                        const ext = path.extname(filePath).toLowerCase();
                        const codeExts = ['.ts', '.py', '.js', '.tsx', '.jsx', '.go', '.rs', '.c', '.cpp', '.cc', '.h', '.hpp', '.lua', '.java', '.sh', '.rb', '.php', '.cs', '.swift'];
                        const configExts = ['.json', '.yml', '.yaml', '.toml', '.env', '.xml', '.ini'];
                        if (codeExts.includes(ext)) return 1;
                        if (configExts.includes(ext)) return 2;
                        return 3;
                    };

                    // Sort memory results by priority before picking top 5
                    const prioritizedMemory = [...memoryResults].sort((a, b) => {
                        const pathA = (a as any).metadata?.path;
                        const pathB = (b as any).metadata?.path;
                        const prioA = getPriority(pathA);
                        const prioB = getPriority(pathB);
                        if (prioA !== prioB) return prioA - prioB;
                        return 0; // Maintain relevance order within same priority
                    });

                    console.debug(`[WorkspaceContext] Found ${memoryResults.length} memory entries, prioritized code first.`);
                    memoryContext = prioritizedMemory
                        .slice(0, memorySliceCount)
                        .map(m => {
                            const str = typeof m === 'string' ? m : (m as any).content || JSON.stringify(m);
                            return str.length > memoryCharLimit ? `- ${str.slice(0, memoryCharLimit)}... (truncated)` : `- ${str}`;
                        })
                        .join('\n');
                }
            } catch (err) {
                console.error(`[WorkspaceContextMiddleware] Memory lookup failed: ${err}`);
            }
        }
    }

        // 3b. Wiki Lookup - surface previously-learned, confidence-scored knowledge
        let wikiContext: string | undefined;
        let wikiPagesUsed: string[] = [];
        if (userContent) {
            try {
                const persona = taskTypeToPersona(context.taskType);
                const wikiNamespace = context.wsHash || context.sessionId;
                const wiki = memoryManager.getWiki(wikiNamespace || 'global', context.workspaceRoot);
                const pages = await wiki.search(userContent, persona);
                if (pages.length > 0) {
                    const topPages = pages.slice(0, 3);
                    wikiPagesUsed = topPages.map(p => p.title);
                    wikiContext = topPages
                        .map(p => `### ${p.title}\n${p.content.slice(0, 500)}`)
                        .join('\n\n');
                }
            } catch (err) {
                console.error(`[WorkspaceContextMiddleware] Wiki lookup failed: ${err}`);
            }
        }
        (context as any).wikiPagesUsed = wikiPagesUsed;

        // 4. Grounding Gate check
        let groundingGate = '';
        if (context.workspaceRoot) {
            const readmePath = path.join(context.workspaceRoot, 'README.md');
            try {
                await fs.access(readmePath);
                groundingGate = `\n\n## 📖 READ-FIRST GATE ACTIVATED\nA README.md or project documentation is detected in the workspace root: ${context.workspaceRoot}.\nYou MUST verify all assertions against the provided context blocks in this prompt before proposing any architecture or implementation. Ground your assertions in local file contents.`;
            } catch {
                if (userContent?.includes('file://')) {
                    groundingGate = `\n\n## 🔍 SOURCE-SPECIFIC GROUNDING\nYou are being asked to interact with specific file URIs. You MUST verify their contents via tools BEFORE asserting their structure or state.`;
                }
            }
        }

        // 5. Store context for downstream middlewares (e.g., AgenticMiddleware)
        // Always store memory and grounding gate on context so AgenticMiddleware can consume them.
        (context as any).memoryContext = memoryContext;
        (context as any).groundingGate = groundingGate;
        
        let workspaceContextStr = '';
        if (dirTree) workspaceContextStr += `\nProject Structure:\n${dirTree}\n`;
        if (grepResults.length > 0) {
            // Priority-aware truncation: grepResults is already sorted (Code -> Config -> Docs).
            // We accumulate until grepCharLimit chars to ensure code context is preserved over others.
            let currentLen = 0;
            const prioritizedSnippets: string[] = [];
            for (const snippet of grepResults) {
                if (currentLen + snippet.length > grepCharLimit) {
                    prioritizedSnippets.push(`\n... (context truncated to ${Math.round(grepCharLimit / 1000)}k chars, prioritizing code)`);
                    break;
                }
                prioritizedSnippets.push(snippet);
                currentLen += snippet.length + 1; // +1 for newline
            }
            workspaceContextStr += `\nRelevant File Snippets:\n${prioritizedSnippets.join('\n')}\n`;
        }
        if (wikiContext) {
            workspaceContextStr += `\n<wiki_context_isolation_gate>\n## 📚 WIKI KNOWLEDGE\n${wikiContext}\n</wiki_context_isolation_gate>\n`;
        }
        (context as any).grepContext = workspaceContextStr || undefined;

        let fullSystemPrompt = '';

        // Only inject a system prompt when NOT in agentic mode.
        // In agentic mode, AgenticMiddleware owns the system prompt to prevent
        // double-injection which garbles model responses.
        if (!isAgentic) {
            try {
                const isSubtask = (context as any).isSubtask === true;
                const dynamicPrompt = await getIntelligentSystemPrompt({
                    context: userContent,
                    keywords: context.keywords || [],
                    memory: memoryContext,
                    workspace: (context as any).grepContext,
                    isSubtask: isSubtask
                });

                const highLevelStepsSection = `\n\n## HIGH-LEVEL STEPS\nWhen responding to a task, always begin with a numbered list of at most **2** high-level steps.`;

                const CONTEXT_START_MARKER = '<!-- WORKSPACE_CONTEXT_START -->';
                const CONTEXT_END_MARKER = '<!-- WORKSPACE_CONTEXT_END -->';
                fullSystemPrompt = `\n${CONTEXT_START_MARKER}\n${dynamicPrompt}${highLevelStepsSection}${groundingGate}\n${CONTEXT_END_MARKER}\n`;
                
                const messages = context.request.messages;
                const sysMsgIdx = messages.findIndex(m => m.role === 'system');

                if (sysMsgIdx !== -1) {
                    const msg = messages[sysMsgIdx];
                    const currentContent = getMessageContent(msg.content);
                    if (currentContent.includes(CONTEXT_START_MARKER)) {
                        // Replace existing context block
                        const regex = new RegExp(`${CONTEXT_START_MARKER}[\\s\\S]*?${CONTEXT_END_MARKER}`, 'g');
                        if (typeof msg.content === 'string') {
                            msg.content = msg.content.replace(regex, fullSystemPrompt);
                        } else if (Array.isArray(msg.content)) {
                            msg.content.forEach((p: any) => {
                                if (p.text) p.text = p.text.replace(regex, fullSystemPrompt);
                            });
                        }
                    } else {
                        // Prepend to existing system message
                        prependToMessageContent(msg, fullSystemPrompt + '\n');
                    }
                } else {
                    messages.unshift({ role: 'system', content: fullSystemPrompt });
                }
            } catch (err) {
                console.error(`[WorkspaceContextMiddleware] Prompt injection failed: ${err}`);
            }
        } else {
            console.error(`[WorkspaceContextMiddleware] Agentic mode: skipping own system prompt injection, delegating to AgenticMiddleware.`);
        }

        const messagesText = context.request.messages?.map((m: any) => getMessageContent(m.content)).join(' ') || '';
        const shortTermTokens = Math.ceil(messagesText.length / 3.8);
        const longTermTokens = Math.ceil((memoryContext?.length || 0) / 3.8);
        const wikiTokens = Math.ceil((wikiContext?.length || 0) / 3.8);
        const grepTokens = Math.ceil((workspaceContextStr?.length || 0) / 3.8);
        const groundingTokens = Math.ceil((groundingGate?.length || 0) / 3.8);
        const sysPromptTokens = Math.ceil((fullSystemPrompt?.length || 0) / 3.8);

        const steeringTelemetry = {
            persona: (context as any).taskType || 'coder',
            matchedKeywords: (context as any).keywords || [],
            memoryLayers: {
                shortTermTokens,
                longTermTokens,
                wikiTokens,
                grepTokens,
                groundingTokens,
                sysPromptTokens,
                totalContextTokens: shortTermTokens + longTermTokens + wikiTokens + grepTokens + groundingTokens + sysPromptTokens
            },
            groundingGate: groundingGate || null,
            dirTree: dirTree || null,
            fullAssembledSystemPrompt: fullSystemPrompt || '(Delegated to AgenticMiddleware)',
            subtaskContext: (context as any).subtask || null,
            durationMs: Date.now() - startMs
        };

        (context as any).telemetry = {
            memoryContext,
            grepContext: workspaceContextStr || undefined,
            wikiContext,
            groundingGate,
            dirTree,
            durationMs: Date.now() - startMs,
            steeringTelemetry
        };

        console.error(`[WorkspaceContextMiddleware] ${Date.now() - startMs}ms context injected for session=${sessionId}`);
        
        await next();
    }
}
