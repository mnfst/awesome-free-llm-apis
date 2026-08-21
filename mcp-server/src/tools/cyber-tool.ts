import { CyberToolsRegistry } from '../utils/CyberToolsRegistry.js';
import { GlobalWikiManager } from '../utils/GlobalWikiManager.js';
import { WikiMemory } from '../memory/wiki.js';
import { RepositoryGraph } from '../memory/dependency-scanner.js';
import { logToolCall } from '../utils/ChatLogger.js';
import { TaskType } from '../pipeline/middleware.js';
import path from 'node:path';
import { promises as fs, existsSync } from 'node:fs';

export interface CyberToolInput {
    action: 'list_tools' | 'get_tool' | 'register_tool' | 'wiki_lookup'
        | 'learn' | 'coach' | 'save_graph' | 'load_graph' | 'tool_memory';
    toolName?: string;
    githubUrl?: string;
    sessionId?: string;
    // learn / coach
    goal?: string;
    level?: 'beginner' | 'intermediate' | 'advanced';
    observation?: string;
    // save_graph
    graphNode?: {
        id: string;
        label: string;
        type?: 'goal' | 'hypothesis' | 'action' | 'finding' | 'deadend';
        from?: string;
    };
    // tool_memory
    memoryOp?: 'read' | 'write';
    note?: string;

    // DAG reverse-engineering extensions
    mode?: 'teach' | 'dag_reverse';
    repoPath?: string;
    nodeId?: string;
    statusOnly?: boolean;
    sliceSize?: number;
}

export interface DagNode {
    id: string;
    sliceKey: string;
    status: 'pending' | 'done' | 'error';
    itemCount: number;
    items: any[];
    wikiPage?: string;
    error?: string;
}

export interface DagManifest {
    sessionId: string;
    toolName: string;
    repoPath: string;
    createdAt: string;
    totalNodes: number;
    nodes: DagNode[];
    cursor: number;
    completedNodes: number;
    wikiPagesWritten: string[];
}

const CYBER_WIKI_NAMESPACE = 'cyber-tools';

const FAILURE_LANGUAGE = /\b(didn't work|did not work|failed to|failure|error occurred|unsuccessful|not working|dead end)\b/i;

/**
 * Educational-coach system prompt shared by 'learn' and 'coach'. The model must teach, never claim
 * to execute, and must refuse targets that are clearly not authorized (no CTF/lab/consent framing).
 */
const COACH_SYSTEM_PROMPT = `You are a hands-on cybersecurity tutor for authorized security testing, CTF challenges, and lab environments ONLY.
You never execute commands yourself — you teach the learner exactly what to run and why, then they run it and report back.
For every step give: (1) the exact command, (2) a plain-English explanation of each flag/argument, (3) what output to expect, (4) how to interpret that output, (5) a safety/authorization note.
If the target or goal is not clearly an authorized test, CTF, or lab exercise, refuse and explain why.
Never claim you ran a command or observed real output — you only ever propose the next command for the human to run.`;

async function callCoachLLM(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, sessionId: string): Promise<string> {
    const { useFreeLLM } = await import('./use-free-llm.js');
    const result = await useFreeLLM({
        messages,
        taskType: TaskType.Cyber,
        sessionId,
        isOnePass: true
    } as any);
    const choices: Array<{ message?: { content?: string }; text?: string }> = Array.isArray((result as any)?.choices) ? (result as any).choices : [];
    const text = choices.map(c => (c?.message?.content ?? c?.text ?? '').trim()).filter(Boolean).join('\n\n');
    return text;
}

function graphPageTitle(sessionId: string): string {
    return `ctf-graph/${sessionId}`;
}

function progressPageTitle(sessionId: string): string {
    return `progress/${sessionId}`;
}

interface ProgressRecord {
    goal: string;
    level: string;
    plan: string;
    completedSteps: Array<{ observation?: string; advice: string; at: string }>;
    /** Total steps taken so far — kept separate from completedSteps.length since that array is windowed for storage. */
    stepCount: number;
    createdAt: string;
}

async function loadGraph(wiki: WikiMemory, sessionId: string): Promise<RepositoryGraph> {
    const page = await wiki.read(graphPageTitle(sessionId));
    if (!page) return new RepositoryGraph(CYBER_WIKI_NAMESPACE);
    try {
        const data = JSON.parse(page.content);
        return RepositoryGraph.deserialize(CYBER_WIKI_NAMESPACE, data);
    } catch {
        return new RepositoryGraph(CYBER_WIKI_NAMESPACE);
    }
}

async function persistGraph(wiki: WikiMemory, sessionId: string, graph: RepositoryGraph) {
    const serialized = graph.serialize();
    const links = graph.getAllNodes().map(n => n.id);
    await wiki.write(graphPageTitle(sessionId), JSON.stringify(serialized), ['cyber', 'ctf'], links);
}

function renderGraph(graph: RepositoryGraph): string {
    const nodes = graph.getAllNodes();
    const edges = graph.getAllEdges();
    if (nodes.length === 0) return '(no decision graph yet)';
    const lines = nodes.map(n => `- [${n.metadata?.ctfType || n.type}] ${n.id}: ${n.metadata?.label || ''}`);
    const edgeLines = edges.map(e => `  ${e.source} -> ${e.target}`);
    return [...lines, ...edgeLines].join('\n');
}

// Wiki pages are hard-capped at wikiConfig.maxPageSizeBytes (8192 bytes). A CTF session's progress
// record grows on every 'coach' call (plan + a full observation/advice per step), so it's capped and
// windowed here to stay well under that ceiling regardless of how long the session runs.
const PLAN_STORAGE_CAP = 1500;
const STEP_TEXT_CAP = 400;
const MAX_STORED_STEPS = 6;
const TOOL_NOTE_CAP = 500;
const TOOL_MEMORY_MAX_BYTES = 6000;

function capText(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}\n…[truncated for storage]` : text;
}

function boundedProgress(progress: ProgressRecord): ProgressRecord {
    return {
        ...progress,
        plan: capText(progress.plan, PLAN_STORAGE_CAP),
        completedSteps: progress.completedSteps.slice(-MAX_STORED_STEPS)
    };
}

/** Never throws — the coach must keep responding even if a page can't be persisted this turn. */
async function safeWikiWrite(wiki: WikiMemory, title: string, content: string, tags: string[], links: string[] = []): Promise<boolean> {
    try {
        await wiki.write(title, content, tags, links);
        return true;
    } catch (err) {
        console.error(`[cyber_tool] wiki write failed for "${title}":`, err);
        return false;
    }
}

/** Keeps only the most recent entries (split on the '---' separator) so the page stays under the size cap. */
function trimToByteBudget(content: string, maxBytes: number): string {
    const entries = content.split('\n\n---\n');
    while (entries.length > 1 && Buffer.byteLength(entries.join('\n\n---\n'), 'utf-8') > maxBytes) {
        entries.shift();
    }
    let joined = entries.join('\n\n---\n');
    if (Buffer.byteLength(joined, 'utf-8') > maxBytes) {
        joined = joined.slice(-maxBytes);
    }
    return joined;
}

export async function cyberTool(input: CyberToolInput) {
    const start = Date.now();
    const action = input.action || 'list_tools';
    const sessionId = input.sessionId || 'cyber_tools_session';
    let result: any;
    let isError = false;

    try {
        if (action === 'list_tools') {
            const tools = await CyberToolsRegistry.loadRegistry();
            result = {
                success: true,
                totalTools: Object.keys(tools).length,
                registryPath: CyberToolsRegistry.getRegistryFilePath(),
                tools
            };
        } else if (action === 'get_tool') {
            if (!input.toolName) throw new Error('toolName parameter required for get_tool action');
            const url = await CyberToolsRegistry.getToolGithubUrl(input.toolName);
            result = {
                success: !!url,
                toolName: input.toolName,
                githubUrl: url || null
            };
        } else if (action === 'register_tool') {
            if (!input.toolName || !input.githubUrl) throw new Error('toolName and githubUrl required for register_tool');
            const updated = await CyberToolsRegistry.registerTool(input.toolName, input.githubUrl);
            result = {
                success: true,
                registeredTool: input.toolName,
                githubUrl: input.githubUrl,
                registry: updated
            };
        } else if (action === 'wiki_lookup') {
            if (!input.toolName) throw new Error('toolName required for wiki_lookup action');
            const wiki = new WikiMemory(CYBER_WIKI_NAMESPACE);
            const page = await wiki.read(`${input.toolName}/flags_and_troubleshooting`);
            result = {
                success: !!page,
                toolName: input.toolName,
                wikiPage: page || null
            };
        } else if (action === 'learn') {
            const level = input.level || 'beginner';
            const wiki = new WikiMemory(CYBER_WIKI_NAMESPACE);

            if (input.mode === 'dag_reverse') {
                if (!input.repoPath) throw new Error('repoPath required for learn action in dag_reverse mode');
                if (!input.toolName) throw new Error('toolName required for learn action in dag_reverse mode');

                const SLICE_SIZE = Math.min(input.sliceSize ?? 50, 50);
                const nodes: DagNode[] = [];

                if (input.toolName === 'cybersec-toolkit') {
                    let configPath = input.repoPath ? path.join(input.repoPath, 'tools_config.json') : '';
                    if (!configPath || !existsSync(configPath)) {
                        const candidates = [
                            path.resolve(process.cwd(), 'external/cyber-tools-index/tools_config.json'),
                            path.resolve(process.cwd(), 'tests/context/cybersec-toolkit/tools_config.json'),
                            path.resolve(process.cwd(), 'scratch/cybersec-toolkit/tools_config.json')
                        ];
                        for (const c of candidates) {
                            if (existsSync(c)) {
                                configPath = c;
                                break;
                            }
                        }
                    }
                    if (!configPath || !existsSync(configPath)) {
                        throw new Error(`tools_config.json not found for cybersec-toolkit in ${input.repoPath || 'default paths'}`);
                    }
                    const raw = JSON.parse(await fs.readFile(configPath, 'utf-8'));
                    const byCategory = new Map<string, any[]>();
                    for (const t of raw) {
                        const cat = t.module ?? 'other';
                        if (!byCategory.has(cat)) byCategory.set(cat, []);
                        byCategory.get(cat)!.push(t);
                    }
                    for (const [cat, tools] of byCategory.entries()) {
                        const slicedTools = tools.slice(0, SLICE_SIZE);
                        nodes.push({
                            id: `cybersec-toolkit/${cat}`,
                            sliceKey: cat,
                            status: 'pending',
                            itemCount: slicedTools.length,
                            items: slicedTools.map((t: any) => ({ name: t.name, method: t.method, url: t.url, module: t.module }))
                        });
                    }
                } else if (input.toolName === 'hexstrike-ai') {
                    const mcpPath = path.join(input.repoPath, 'hexstrike_mcp.py');
                    const content = await fs.readFile(mcpPath, 'utf-8');
                    const funcs = [...content.matchAll(/^\s*def ([a-zA-Z][a-zA-Z0-9_]*)\(/gm)]
                        .map(m => m[1]).filter(f => !f.startsWith('_') && f !== 'format');
                    for (let i = 0, n = 0; i < funcs.length; i += SLICE_SIZE, n++) {
                        const batch = funcs.slice(i, i + SLICE_SIZE);
                        nodes.push({
                            id: `hexstrike-ai/slice-${n}`,
                            sliceKey: `slice-${n}`,
                            status: 'pending',
                            itemCount: batch.length,
                            items: batch
                        });
                    }
                } else {
                    throw new Error(`dag_reverse mode unsupported for toolName "${input.toolName}"`);
                }

                const manifest: DagManifest = {
                    sessionId,
                    toolName: input.toolName,
                    repoPath: input.repoPath,
                    createdAt: new Date().toISOString(),
                    totalNodes: nodes.length,
                    nodes,
                    cursor: 0,
                    completedNodes: 0,
                    wikiPagesWritten: []
                };

                const manifestForStorage = {
                    ...manifest,
                    nodes: manifest.nodes.map(n => ({ id: n.id, sliceKey: n.sliceKey, status: n.status, itemCount: n.itemCount, wikiPage: n.wikiPage, error: n.error }))
                };
                const manifestKey = `dag_manifest/${sessionId}`;
                await safeWikiWrite(wiki, manifestKey, JSON.stringify(manifestForStorage), ['cyber', 'dag', input.toolName]);

                const graph = await loadGraph(wiki, sessionId);
                graph.addNode('root', 'concept', { ctfType: 'goal', label: input.goal || `DAG Reverse ${input.toolName}` });
                await persistGraph(wiki, sessionId, graph);

                result = {
                    success: true,
                    goal: input.goal || `DAG Reverse ${input.toolName}`,
                    totalNodes: nodes.length,
                    nextNodeId: nodes[0]?.id ?? null,
                    progressKey: manifestKey,
                    graphKey: graphPageTitle(sessionId)
                };
            } else {
                if (!input.goal) throw new Error('goal parameter required for learn action');
                const walkthrough = await callCoachLLM([
                    { role: 'system', content: COACH_SYSTEM_PROMPT },
                    { role: 'user', content: `Learner level: ${level}.\nGoal: ${input.goal}\nGive a numbered, step-by-step walkthrough for this goal in an authorized/lab/CTF context.` }
                ], sessionId);

                const progress: ProgressRecord = {
                    goal: input.goal,
                    level,
                    plan: walkthrough,
                    completedSteps: [],
                    stepCount: 0,
                    createdAt: new Date().toISOString()
                };
                await safeWikiWrite(wiki, progressPageTitle(sessionId), JSON.stringify(boundedProgress(progress)), ['cyber', 'learn']);

                const graph = await loadGraph(wiki, sessionId);
                graph.addNode('root', 'concept', { ctfType: 'goal', label: input.goal });
                await persistGraph(wiki, sessionId, graph);

                result = {
                    success: true,
                    goal: input.goal,
                    level,
                    walkthrough,
                    progressKey: progressPageTitle(sessionId),
                    graphKey: graphPageTitle(sessionId)
                };
            }
        } else if (action === 'coach') {
            const wiki = new WikiMemory(CYBER_WIKI_NAMESPACE);

            if (input.mode === 'dag_reverse') {
                const manifestKey = `dag_manifest/${sessionId}`;
                const manifestPage = await wiki.read(manifestKey);
                if (!manifestPage) throw new Error(`dag_manifest not found for session "${sessionId}". Run learn action in dag_reverse mode first.`);

                const manifest: DagManifest = JSON.parse(manifestPage.content);

                if (input.statusOnly) {
                    const done = manifest.nodes.filter(n => n.status === 'done').length;
                    const pending = manifest.nodes.filter(n => n.status === 'pending').length;
                    const errors = manifest.nodes.filter(n => n.status === 'error').length;
                    const next = manifest.nodes.find(n => n.status === 'pending');
                    result = {
                        success: true,
                        sessionId,
                        toolName: manifest.toolName,
                        totalNodes: manifest.totalNodes,
                        done, pending, errors,
                        pctComplete: Math.round((done / manifest.totalNodes) * 100),
                        nextNodeId: next?.id ?? null,
                        wikiPagesWritten: manifest.wikiPagesWritten
                    };
                    return result;
                }

                let targetNode: DagNode | undefined;
                if (input.nodeId) {
                    targetNode = manifest.nodes.find(n => n.id === input.nodeId);
                    if (!targetNode) throw new Error(`nodeId "${input.nodeId}" not found in manifest`);
                } else {
                    targetNode = manifest.nodes.find(n => n.status === 'pending');
                }

                if (!targetNode) {
                    result = { success: true, message: 'All DAG nodes complete', totalNodes: manifest.totalNodes, completedNodes: manifest.completedNodes, pctComplete: 100 };
                    return result;
                }

                // Rehydrate items from source repo files on demand
                let items: any[] = [];
                if (manifest.toolName === 'cybersec-toolkit') {
                    const configPath = path.join(manifest.repoPath, 'tools_config.json');
                    const raw = JSON.parse(await fs.readFile(configPath, 'utf-8'));
                    const category = targetNode.sliceKey;
                    items = raw.filter((t: any) => (t.module ?? 'other') === category).slice(0, 50).map((t: any) => ({ name: t.name, method: t.method, url: t.url, module: t.module }));
                } else if (manifest.toolName === 'hexstrike-ai') {
                    const mcpPath = path.join(manifest.repoPath, 'hexstrike_mcp.py');
                    const content = await fs.readFile(mcpPath, 'utf-8');
                    const funcs = [...content.matchAll(/^\s*def ([a-zA-Z][a-zA-Z0-9_]*)\(/gm)]
                        .map(m => m[1]).filter(f => !f.startsWith('_') && f !== 'format');
                    const sliceIndex = parseInt(targetNode.sliceKey.replace('slice-', ''), 10) || 0;
                    items = funcs.slice(sliceIndex * 50, (sliceIndex + 1) * 50);
                }
                targetNode.items = items;

                const itemSummary = items.map((item: any) => {
                    if (typeof item === 'string') return `endpoint: ${item}`;
                    return `${item.name} [${item.method}] → ${item.url}`;
                }).join('\n');

                const observation = `Repository: ${manifest.toolName}\nNode: ${targetNode.id}\nItems (${targetNode.itemCount}):\n${itemSummary}`;

                let analysis = '';
                try {
                    analysis = await callCoachLLM([
                        { role: 'system', content: COACH_SYSTEM_PROMPT },
                        { role: 'user', content: `Reverse-engineer the following security tools and their setup mechanisms. For each, produce concise notes on: (1) install command, (2) typical usage, (3) security testing use-case.\n\n${observation}` }
                    ], sessionId);
                } catch (err: any) {
                    analysis = `(LLM call unavailable: ${err?.message || err})\n\nItems scanned:\n${itemSummary}`;
                }

                for (const item of targetNode.items) {
                    const name = typeof item === 'string' ? item : item.name;
                    const note = typeof item === 'string'
                        ? `MCP endpoint: ${item} | From: hexstrike-ai server`
                        : `Install: ${item.method} | URL: ${item.url} | Category: ${item.module}`;
                    const existing = await wiki.read(`${name}/run_suggestions`);
                    const appended = trimToByteBudget(existing ? `${existing.content}\n\n---\n${note}` : note, TOOL_MEMORY_MAX_BYTES);
                    await safeWikiWrite(wiki, `${name}/run_suggestions`, appended, ['cyber', manifest.toolName]);
                }

                const toolRows = targetNode.items.map((item: any) => {
                    if (typeof item === 'string') return `| \`${item}\` | hexstrike MCP endpoint | — |`;
                    return `| \`${item.name}\` | \`${item.method}\` | ${item.url} |`;
                });

                const wikiContent = [
                    `# ${manifest.toolName} — ${targetNode.sliceKey.toUpperCase()}`,
                    ``,
                    `> DAG-generated | Session: \`${sessionId}\` | Source: https://github.com/${manifest.toolName}`,
                    ``,
                    `## Overview`,
                    `**${targetNode.itemCount} items** in node \`${targetNode.id}\``,
                    ``,
                    `## Items`,
                    ``,
                    `| Item | Type/Method | Source |`,
                    `|:---|:---|:---|`,
                    ...toolRows,
                    ``,
                    `## Reverse-Engineering Notes`,
                    ``,
                    analysis
                ].join('\n');

                await safeWikiWrite(wiki, targetNode.id, wikiContent, ['cyber', 'dag', manifest.toolName]);

                const graph = await loadGraph(wiki, sessionId);
                graph.addNode(targetNode.id, 'concept', { ctfType: 'action', label: `Node ${targetNode.id}: ${targetNode.itemCount} items` });
                graph.addEdge('root', targetNode.id, 'references');
                await persistGraph(wiki, sessionId, graph);

                targetNode.status = 'done';
                targetNode.wikiPage = targetNode.id;
                manifest.completedNodes += 1;
                manifest.cursor = manifest.nodes.findIndex(n => n.status === 'pending');
                if (!manifest.wikiPagesWritten.includes(targetNode.id)) manifest.wikiPagesWritten.push(targetNode.id);

                const manifestForStorage = {
                    ...manifest,
                    nodes: manifest.nodes.map(n => ({ id: n.id, sliceKey: n.sliceKey, status: n.status, itemCount: n.itemCount, wikiPage: n.wikiPage, error: n.error }))
                };
                await safeWikiWrite(wiki, manifestKey, JSON.stringify(manifestForStorage), ['cyber', 'dag', manifest.toolName]);

                const nextPending = manifest.nodes.find(n => n.status === 'pending');
                result = {
                    success: true,
                    nodeId: targetNode.id,
                    status: 'done',
                    itemsProcessed: targetNode.itemCount,
                    wikiPageTitle: targetNode.id,
                    nextNodeId: nextPending?.id ?? null,
                    completedNodes: manifest.completedNodes,
                    totalNodes: manifest.totalNodes,
                    pctComplete: Math.round((manifest.completedNodes / manifest.totalNodes) * 100)
                };
            } else {
                const progressPage = await wiki.read(progressPageTitle(sessionId));
                const progress: ProgressRecord | null = progressPage ? JSON.parse(progressPage.content) : null;

                const graph = await loadGraph(wiki, sessionId);
                const graphContext = renderGraph(graph);

                let toolMemoryContext = '';
                if (input.toolName) {
                    const suggestions = await wiki.read(`${input.toolName}/run_suggestions`);
                    const troubleshooting = await wiki.read(`${input.toolName}/flags_and_troubleshooting`);
                    toolMemoryContext = [
                        suggestions ? `Prior run suggestions for ${input.toolName}:\n${suggestions.content}` : '',
                        troubleshooting ? `Known flags/troubleshooting for ${input.toolName}:\n${troubleshooting.content}` : ''
                    ].filter(Boolean).join('\n\n');
                }

                const contextBlock = [
                    progress ? `Original goal: ${progress.goal} (level: ${progress.level})\nPlan so far:\n${progress.plan}` : '(no saved plan for this session)',
                    `Decision graph so far:\n${graphContext}`,
                    toolMemoryContext
                ].filter(Boolean).join('\n\n---\n\n');

                const advice = await callCoachLLM([
                    { role: 'system', content: COACH_SYSTEM_PROMPT },
                    { role: 'user', content: `${contextBlock}\n\n---\n\nLearner's latest observation: ${input.observation || '(none provided)'}\n\nDiagnose what happened and give the single next command to run, with explanation, expected output, and safety note.` }
                ], sessionId);

                const isFailure = FAILURE_LANGUAGE.test(input.observation || '');

                const baseProgress: ProgressRecord = progress || {
                    goal: input.goal || '(unspecified)',
                    level: input.level || 'beginner',
                    plan: '',
                    completedSteps: [],
                    stepCount: 0,
                    createdAt: new Date().toISOString()
                };
                const stepNumber = (Number.isFinite(baseProgress.stepCount) ? baseProgress.stepCount : baseProgress.completedSteps.length) + 1;
                const updatedProgress: ProgressRecord = {
                    ...baseProgress,
                    stepCount: stepNumber,
                    completedSteps: [
                        ...baseProgress.completedSteps,
                        { observation: input.observation ? capText(input.observation, STEP_TEXT_CAP) : undefined, advice: capText(advice, STEP_TEXT_CAP), at: new Date().toISOString() }
                    ]
                };
                await safeWikiWrite(wiki, progressPageTitle(sessionId), JSON.stringify(boundedProgress(updatedProgress)), ['cyber', 'learn']);

                const stepId = `step-${stepNumber}`;
                const priorStepId = stepNumber > 1 ? `step-${stepNumber - 1}` : 'root';
                graph.addNode(stepId, 'concept', {
                    ctfType: isFailure ? 'deadend' : 'action',
                    label: input.observation ? `Observed: ${input.observation}` : advice.slice(0, 120)
                });
                graph.addEdge(priorStepId, stepId, 'references');
                await persistGraph(wiki, sessionId, graph);

                if (input.toolName) {
                    const suggestionNote = advice.slice(0, TOOL_NOTE_CAP);
                    const existing = await wiki.read(`${input.toolName}/run_suggestions`);
                    const appended = trimToByteBudget(existing ? `${existing.content}\n\n---\n${suggestionNote}` : suggestionNote, TOOL_MEMORY_MAX_BYTES);
                    await safeWikiWrite(wiki, `${input.toolName}/run_suggestions`, appended, ['cyber']);
                    if (isFailure) {
                        GlobalWikiManager.logFailure(input.toolName);
                    } else {
                        GlobalWikiManager.logSuccess(input.toolName);
                    }
                    await GlobalWikiManager.flushToWiki(wiki);
                }

                result = {
                    success: true,
                    nextStep: advice,
                    notes: isFailure ? 'Observation looked like a failure — marked as a dead end in the decision graph.' : undefined,
                    progressKey: progressPageTitle(sessionId),
                    graphKey: graphPageTitle(sessionId)
                };
            }
        } else if (action === 'save_graph') {
            const wiki = new WikiMemory(CYBER_WIKI_NAMESPACE);
            const graph = await loadGraph(wiki, sessionId);
            if (input.graphNode) {
                const { id, label, type, from } = input.graphNode;
                graph.addNode(id, 'concept', { ctfType: type || 'action', label });
                if (from) graph.addEdge(from, id, 'references');
            }
            await persistGraph(wiki, sessionId, graph);
            result = {
                success: true,
                sessionId,
                graphKey: graphPageTitle(sessionId),
                totalNodes: graph.getAllNodes().length,
                totalEdges: graph.getAllEdges().length
            };
        } else if (action === 'load_graph') {
            const wiki = new WikiMemory(CYBER_WIKI_NAMESPACE);
            const graph = await loadGraph(wiki, sessionId);
            result = {
                success: true,
                sessionId,
                nodes: graph.getAllNodes(),
                edges: graph.getAllEdges(),
                rendered: renderGraph(graph)
            };
        } else if (action === 'tool_memory') {
            if (!input.toolName) throw new Error('toolName required for tool_memory action');
            const wiki = new WikiMemory(CYBER_WIKI_NAMESPACE);
            const memoryOp = input.memoryOp || 'read';
            if (memoryOp === 'write') {
                if (!input.note) throw new Error('note required for tool_memory write');
                const existing = await wiki.read(`${input.toolName}/run_suggestions`);
                const note = capText(input.note, TOOL_NOTE_CAP);
                const appended = trimToByteBudget(existing ? `${existing.content}\n\n---\n${note}` : note, TOOL_MEMORY_MAX_BYTES);
                const written = await safeWikiWrite(wiki, `${input.toolName}/run_suggestions`, appended, ['cyber']);
                result = { success: written, toolName: input.toolName, wikiPage: written ? await wiki.read(`${input.toolName}/run_suggestions`) : null };
            } else {
                const suggestions = await wiki.read(`${input.toolName}/run_suggestions`);
                const troubleshooting = await wiki.read(`${input.toolName}/flags_and_troubleshooting`);
                const stats = GlobalWikiManager.getStats()[input.toolName];
                result = {
                    success: !!(suggestions || troubleshooting),
                    toolName: input.toolName,
                    runSuggestions: suggestions || null,
                    flagsAndTroubleshooting: troubleshooting || null,
                    reliability: stats || null
                };
            }
        } else {
            throw new Error(`Unsupported cyber_tool action: ${action}`);
        }
    } catch (err: any) {
        isError = true;
        result = { error: String(err?.message || err) };
        throw err;
    } finally {
        // Phase 3 Chat Logger Integration — Log each action step into chat-logs.json
        await logToolCall(sessionId, `cyber_tool:${action}`, input, result, Date.now() - start, isError).catch(() => {});
    }

    return result;
}
