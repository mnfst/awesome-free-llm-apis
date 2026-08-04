import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { LRUCache } from 'lru-cache';
import { debounce } from '../../utils/debounce.js';
import type { Middleware, PipelineContext, NextFunction } from '../middleware.js';
import { getMessageContent } from '../../utils/MessageUtils.js';
import { memoryManager } from '../../memory/index.js';
import { getIntelligentSystemPrompt } from './prompts.js';
import { withFileLock } from '../../utils/file-lock.js';
import { WorkspaceIndexer } from '../../memory/indexer.js';
import { writeFileAtomic } from '../../utils/FileUtils.js';
// Removed top-level import of instances.js to break circular dependency
import { LLMExecutor } from '../../utils/LLMExecutor.js';
import { logChatTurn } from '../../utils/ChatLogger.js';

import {
    PROJECTS_DIR,
    STATE_FILE,
    KNOWLEDGE_FILE
} from './constants.js';
import { ContextGatherer } from './context-gatherer.js';
import { classifyIntent, disambiguateConfusedIntent } from './intent-classifier.js';
import { buildExecutionPlan } from './task-classifier.js';
import { ProviderRegistry } from '../../providers/registry.js';


import { SubtaskDecomposer, createEmptyQueueState, newQueueTaskId, type QueueTask, type QueueState, type SubtaskHistoryEntry } from './SubtaskDecomposer.js';
import { ContextResolver } from './ContextResolver.js';
import { HistoryManager } from './HistoryManager.js';
import { SUBTASK_BUDGET_MS } from './constants.js';
import { RunRegistry, type RunInfo } from './RunRegistry.js';

export { createEmptyQueueState, newQueueTaskId, type QueueTask, type QueueState, type SubtaskHistoryEntry };

export function protectInjectedReferenceBlocks(goal: string): { tokenized: string; placeholders: Map<string, string> } {
    return ContextResolver.protectInjectedReferenceBlocks(goal);
}

export function decomposeGoal(goal: string): { tasks: QueueTask[]; resolvedContext: Record<string, string> } {
    return SubtaskDecomposer.decomposeGoal(goal);
}

async function getOrLoadState(sessionId: string): Promise<QueueState> {
    return SubtaskDecomposer.getOrLoadState(sessionId);
}

async function persistState(sessionId: string, projectDir: string): Promise<void> {
    return SubtaskDecomposer.persistState(sessionId, projectDir);
}

const persistStateDebounced = SubtaskDecomposer.persistStateDebounced;



/**
 * Append-only Knowledge Persistence: Accumulates reusable skill entries following
 * the @skill-writer schema. Never overwrites — only appends — so knowledge grows
 * across sessions rather than being reset.

/**
 * Distills an LLM response into a structured skill-writer-schema knowledge entry.
 *
 * Skill-writer schema fields (following standard SKILL.md frontmatter conventions):
 *   - name: short label for the decision/finding (derived from heading or task)
 *   - session: source session ID
 *   - ts: ISO timestamp
 *   - what: the core decision or finding (extracted from bold/heading content)
 *   - why: supporting rationale (extracted from prose context)
 *   - files: file paths referenced (extracted from backtick paths or [file://...] refs)
 *   - example: code block preview if present
 */
function distillToSkillEntry(content: string, sessionId: string): string | null {
    const lines = content.split('\n');

    // 1. Extract the primary heading as the entry name
    const nameMatch = lines.find(l => l.startsWith('## ') || l.startsWith('### '));
    const name = nameMatch ? nameMatch.replace(/^#{2,3}\s+/, '').trim() : `session-${sessionId.slice(0, 8)}`;

    // 2. Extract decisions: bold key-value pairs and completed checklist items
    const decisions = lines
        .filter(l => l.includes('**') || l.includes('- [x]') || l.includes('- ✅'))
        .map(l => l.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean)
        .slice(0, 5);

    if (decisions.length === 0) return null;

    // 3. Extract file references: backtick paths and markdown links
    const fileRefs: string[] = [];
    const filePattern = /`([^`]*\.(ts|js|py|go|rs|json|md|yaml|yml|env))`|file:\/\/([^\s)]+)/g;
    let m: RegExpExecArray | null;
    while ((m = filePattern.exec(content)) !== null) {
        const ref = m[1] || m[3];
        if (ref && !fileRefs.includes(ref)) fileRefs.push(ref);
    }

    // 4. Extract code example preview (first code block, first 3 lines)
    const codeBlockMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
    const example = codeBlockMatch
        ? '```\n' + codeBlockMatch[1].split('\n').slice(0, 3).join('\n') + '\n```'
        : null;

    // 5. Extract entity relationships (minimal Entity Graph)
    const relationships: string[] = [];
    if (fileRefs.length > 1) {
        // Simple heuristic: relate first file to subsequent files
        const primary = fileRefs[0];
        for (let i = 1; i < fileRefs.length; i++) {
            relationships.push(`- [FILE] ${primary} → [DEPENDS_ON] ${fileRefs[i]}`);
        }
    }
    decisions.forEach(d => {
        if (d.includes('use') || d.includes('implement') || d.includes('select')) {
            relationships.push(`- [DECISION] ${d} → [RATIONALE] Refined in session ${sessionId.slice(0, 8)}`);
        }
    });

    // 6. Compose skill-writer-schema entry
    const entry = [
        `\n\n---`,
        ``,
        `### ${name}`,
        ``,
        `**session:** ${sessionId}  **ts:** ${new Date().toISOString()}`,
        ``,
        `**what:**`,
        decisions.map(d => `- ${d}`).join('\n'),
        fileRefs.length > 0 ? `\n**files:**\n${fileRefs.map(f => `- \`${f}\``).join('\n')}` : '',
        relationships.length > 0 ? `\n## Entity Graph\n<!-- entities -->\n${relationships.join('\n')}` : '',
        example ? `\n**example:**\n${example}` : '',
    ].filter(l => l !== '').join('\n');

    return entry.length > 100 ? entry : null;
}



/**
 * Append-only Knowledge Persistence: Distills LLM responses into structured
 * skill-writer-schema entries so knowledge.md grows as a reusable knowledge base
 * rather than a raw session log dump.
 */
async function appendKnowledge(projectDir: string, sessionId: string, content: string): Promise<void> {
    const entry = distillToSkillEntry(content, sessionId);
    if (!entry) return;

    const knowledgePath = path.join(projectDir, KNOWLEDGE_FILE);
    try {
        await withFileLock(knowledgePath, async () => {
            await fs.appendFile(knowledgePath, entry, 'utf-8');
        });
    } catch {
        // non-fatal
    }
}



/**
 * Async Project Setup: Ensures session artifacts exist at the stable HOME_DIR path.
 * Uses ~/.free-llm-mcp/projects/<sessionId>/ so location is consistent regardless
 * of where the MCP server process is launched from.
 */
async function ensureProjectFiles(sessionId: string, workspaceRoot?: string): Promise<string> {
    const projectDir = path.join(PROJECTS_DIR, sessionId);
    await fs.mkdir(projectDir, { recursive: true });

    // Stamp workspace_root into the knowledge file on first creation.
    // This prevents cross-project knowledge bleed when a user reuses a custom sessionId.
    const workspaceStamp = workspaceRoot
        ? `<!-- workspace: ${workspaceRoot} -->\n`
        : '<!-- workspace: unknown -->\n';

    const knowledgePath = path.join(projectDir, KNOWLEDGE_FILE);
    try {
        await fs.access(knowledgePath);
    } catch {
        await writeFileAtomic(knowledgePath, `# Knowledge\n\n${workspaceStamp}`);
    }

    return projectDir;
}

// Matches resolveFileRefs()/resolvePdfRef()'s reference markers (use-free-llm.ts's uriRegex),
// bare `protocol://path` or bracketed `[label](protocol://path)` form.
const REFERENCE_MARKER_REGEX = /\[(?<label>[^\]]+)\]\((?<bProto>file|mcp|ctx7|artifact|pdf):\/\/(?<bPath>[^)]+)\)|(?<proto>file|mcp|ctx7|artifact|pdf):\/\/(?<path>[^\s)]+)/gi;

/**
 * Replaces each reference marker plus its immediately-following injected content block
 * (resolveFileRefs()/resolvePdfRef() inject resolved PDF/file/artifact content in place)
 * with an opaque placeholder token, so decomposeGoal()'s line-splitting logic can't shred
 * the injected block's own internal line structure into bogus one-line "subtasks."
 */
// Bracketed system sentinels — [NOT_FOUND_HARD_STOP: ...], [PDF-PAGE-DEFERRED: ...], etc.
// Scans raw (untokenized) message text for [PDF-PAGE-DEFERRED: <path> — ...] sentinels
// (resolveFileRefs()'s 5-page-per-pass cap) and returns the deferred page references found.
function extractDeferredPdfPages(text: string): string[] {
    return ContextResolver.extractDeferredPdfPages(text);
}

const MAX_CONTEXT_LOG_CHARS = 4000;
function excerptForLog(text: string): string {
    return ContextResolver.excerptForLog(text);
}

function appendDeferredPagesNotice(content: string, deferred: string[], maxPages: number): string {
    return ContextResolver.appendDeferredPagesNotice(content, deferred, maxPages);
}

function restoreProtectedReferenceBlocks(text: string, placeholders: Map<string, string>): string {
    return ContextResolver.restoreProtectedReferenceBlocks(text, placeholders);
}


function getResponseContent(context: PipelineContext): string | undefined {
    const rawContent = context.response?.choices?.[0]?.message?.content;
    return rawContent ? getMessageContent(rawContent) : undefined;
}

/**
 * Hallucination Detection: Extended from a basic error check to also flag
 * patterns that indicate the model is inventing file locations or citing
 * sources it could not have retrieved. Results logged as WARN rather than
 * FAIL so the pipeline continues but the anomaly is auditable.
 *
 * Anti-hallucination strategies implemented here:
 *  1. Empty / error-prefix catch (original)
 *  2. Phantom-citation patterns: "according to the docs", "I can see that ..."
 *  3. Invented file paths: "the function is defined in src/..."
 *  4. Version/date fabrication: specific version numbers without [RETRIEVED] prefix
 */
function calculateCosineSimilarity(str1: string, str2: string): number {
    const getWords = (s: string) => s.toLowerCase().split(/\W+/).filter(Boolean);
    const words1 = getWords(str1);
    const words2 = getWords(str2);
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const freqs1 = new Map<string, number>();
    const freqs2 = new Map<string, number>();
    const allWords = new Set<string>();
    
    words1.forEach(w => { freqs1.set(w, (freqs1.get(w) || 0) + 1); allWords.add(w); });
    words2.forEach(w => { freqs2.set(w, (freqs2.get(w) || 0) + 1); allWords.add(w); });
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    allWords.forEach(w => {
        const val1 = freqs1.get(w) || 0;
        const val2 = freqs2.get(w) || 0;
        dotProduct += val1 * val2;
        magnitude1 += val1 * val1;
        magnitude2 += val2 * val2;
    });
    
    const mag1 = Math.sqrt(magnitude1);
    const mag2 = Math.sqrt(magnitude2);
    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (mag1 * mag2);
}

export interface HallucinationReport {
    status: 'PASS' | 'WARN' | 'FAIL' | 'LOOP_DETECTED';
    reason?: string;
}

export function detectHallucination(content: string, lastResponse?: string): HallucinationReport {
    if (!content || content.trim().length === 0) {
        return { status: 'FAIL', reason: 'empty response' };
    }

    // Cosine similarity loop check
    if (lastResponse) {
        const similarity = calculateCosineSimilarity(content, lastResponse);
        if (similarity > 0.92) {
            return { status: 'LOOP_DETECTED', reason: `High semantic similarity (${similarity.toFixed(2)}) indicating loop` };
        }
    }

    // Extended pattern library
    const phantomCitations = [
        /\baccording to the (documentation|docs|readme|spec)\b/i
    ];
    const inventedState = [
        /\bthe (?:file|function|class|method|module) (?:is|are|was|were) (?:defined|located|found|placed) (?:in|at|under) (?:[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)\b/i
    ];

    if (phantomCitations.some(p => p.test(content))) {
        return { status: 'FAIL', reason: 'phantom citation pattern matched' };
    }
    if (inventedState.some(p => p.test(content))) {
        return { status: 'FAIL', reason: 'invented state pattern matched' };
    }

    const errorPatterns = /\b(error|exception|failed|undefined|null)\b/i;
    if (errorPatterns.test(content.slice(0, 100))) {
        return { status: 'FAIL', reason: 'response starts with error indicator' };
    }

    return { status: 'PASS' };
}

/**
 * Detect whether a user message contains a research or external-knowledge request.
 * These patterns indicate the agent may invoke external search, browse, or retrieve
 * information from outside the context window.
 *
 * Validation is logged explicitly so agents can confirm the step was intentional,
 * reducing hallucination risk when external sources are consulted.
 */
function detectResearchIntent(content: string): boolean {
    const researchPatterns = [
        /\b(search|look up|find|research|browse|retrieve|fetch|crawl|scrape)\b/i,
        /\b(what is|who is|when did|where is|how does|explain|describe|summarize)\b/i,
        /\b(latest|recent|current|today|news|update|version)\b/i,
        /\b(according to|based on|reference|source|documentation|docs)\b/i,
        /\b(web search|internet|online|URL|http|www\.)\b/i,
    ];
    return researchPatterns.some((p) => p.test(content));
}

function logResearchValidation(sessionId: string, userContent: string, step: string): void {
    const timestamp = new Date().toISOString();
    console.error(
        `[AgenticMiddleware][RESEARCH-VALIDATION] session=${sessionId} step="${step}" ` +
        `timestamp=${timestamp} intent_detected=true ` +
        `query_preview="${getMessageContent(userContent).slice(0, 120).replace(/\n/g, ' ')}..."`,
    );
}

const contextSignals = [
    "could you provide", "I need more context", "I don't have access to",
    "can you share", "please provide the", "what is the value of",
    "read the file", "read file", "_read_file", "read_file",
    "inspect file", "open file", "look at the file", "view file"
];

function detectContextSignal(text: string): boolean {
    return contextSignals.some(p => text.toLowerCase().includes(p.toLowerCase()));
}

export function extractCues(text: string): string[] {
    const cues = new Set<string>();

    // 1. Words inside backticks (files, variables, functions)
    const backticks = text.match(/`([^`]+)`/g) || [];
    for (const b of backticks) {
        const val = b.replace(/`/g, '').trim();
        if (val.length > 2) cues.add(val);
    }

    // 2. Words inside single or double quotes
    const quotes = text.match(/["']([^"']+)["']/g) || [];
    for (const q of quotes) {
        const val = q.replace(/["']/g, '').trim();
        if (val.length > 2) cues.add(val);
    }

    // 3. File paths or files (e.g., src/auth.ts, index.js)
    const pathPattern = /\b[a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+\b/g;
    const paths = text.match(pathPattern) || [];
    for (const p of paths) {
        if (p.length > 2) cues.add(p);
    }

    // 4. Function names with parentheses (e.g., execute(), calculate())
    const funcPattern = /\b([a-zA-Z0-9_]+)\s*\(\)/g;
    let match;
    while ((match = funcPattern.exec(text)) !== null) {
        cues.add(match[1]);
    }

    // 5. Environment variables or constants (e.g. JWT_SECRET, PORT)
    const constPattern = /\b[A-Z_]{3,}\b/g;
    const consts = text.match(constPattern) || [];
    for (const c of consts) {
        cues.add(c);
    }

    // 6. CamelCase or snake_case words (variables and function names)
    const varPattern = /\b([a-z]+[A-Z][a-zA-Z0-9]*|[a-zA-Z0-9]+_[a-zA-Z0-9_]+)\b/g;
    const vars = text.match(varPattern) || [];
    for (const v of vars) {
        if (v.length > 3) cues.add(v);
    }

    // 7. Kebab-case dependency/package names (e.g., serve-static, ip-address, body-parser)
    const kebabPattern = /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g;
    const kebabs = text.match(kebabPattern) || [];
    for (const k of kebabs) {
        if (k.length > 3) cues.add(k);
    }

    // 8. Vulnerability IDs (e.g. CVE-2024-39338, GHSA-c2qf-rxjj-qqgw)
    const vulnPattern = /\b(?:CVE-\d{4}-\d+|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/gi;
    const vulns = text.match(vulnPattern) || [];
    for (const v of vulns) {
        cues.add(v);
    }

    return Array.from(cues);
}

function extractEntity(text: string): string {
    const backtickMatch = text.match(/`([^`]+)`/);
    if (backtickMatch) return backtickMatch[1];

    const quoteMatch = text.match(/["']([^"']+)["']/);
    if (quoteMatch) return quoteMatch[1];

    const wordPattern = /\b([a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+|[A-Z_]{3,})\b/;
    const wordMatch = text.match(wordPattern);
    if (wordMatch) return wordMatch[0];

    const sentences = text.split(/[.!?\n]/).filter(Boolean);
    for (const sentence of sentences) {
        for (const sw of contextSignals) {
            const idx = sentence.toLowerCase().indexOf(sw.toLowerCase());
            if (idx !== -1) {
                const entity = sentence.slice(idx + sw.length).trim();
                if (entity.length > 0) {
                    return entity;
                }
            }
        }
    }
    return text.trim();
}

let lastUploadedError: { message: string; stack: string; timestamp: number } | null = null;

function addToQueues(
    commsQueue: string[],
    promptQueue: string[],
    type: string,
    data: any
) {
    try {
        const cleanData = { ...data };

        // Check if the last entry in commsQueue is a duplicate (same type and subtask/file)
        const lastEntryStr = commsQueue[commsQueue.length - 1];
        if (lastEntryStr) {
            try {
                const lastEntry = JSON.parse(lastEntryStr);
                const isDuplicate = lastEntry.type === type &&
                    (lastEntry.subtask === cleanData.subtask || lastEntry.file === cleanData.file);
                if (isDuplicate) {
                    lastEntry.repeatCount = (lastEntry.repeatCount || 1) + 1;
                    lastEntry.ts = new Date().toISOString();
                    // Keep the latest response/messages without truncating
                    if (cleanData.response) lastEntry.response = cleanData.response;
                    if (cleanData.messages) lastEntry.messages = cleanData.messages;
                    commsQueue[commsQueue.length - 1] = JSON.stringify(lastEntry);
                    return;
                }
            } catch {}
        }

        const entry = JSON.stringify({ ts: new Date().toISOString(), type, ...cleanData });
        commsQueue.push(entry);
        
        if (commsQueue.length > 10) {
            commsQueue.shift();
        }

        // Deduplicate and store promptQueue entries (without truncation)
        if (data.messages && data.messages.length > 0) {
            const lastMsg = data.messages[data.messages.length - 1]?.content || '';
            const promptStr = String(lastMsg);
            if (promptStr && !promptQueue.includes(promptStr)) {
                promptQueue.push(promptStr);
                if (promptQueue.length > 3) {
                    promptQueue.shift();
                }
            }
        }
    } catch {}
}

// logChatTurn is now imported from ../../utils/ChatLogger.js (shared with mcp/index.ts)

export function compressSemantically(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;

    const lines = text.split('\n');
    const resultLines: string[] = [];
    let currentLength = 0;
    
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockLang = '';

    const flushCodeBlock = () => {
        if (codeBlockLines.length === 0) return;
        
        let blockText = codeBlockLines.join('\n');
        const maxBlockChars = Math.max(200, Math.floor(maxChars * 0.4)); // Allocate up to 40% of budget for a single block

        if (blockText.length > maxBlockChars) {
            // Compress the code block: keep first 10 and last 10 lines
            if (codeBlockLines.length > 20) {
                const firstPart = codeBlockLines.slice(0, 10);
                const lastPart = codeBlockLines.slice(-10);
                blockText = [
                    ...firstPart,
                    `  // ... [Compressed ${codeBlockLines.length - 20} lines of code to fit context budget] ...`,
                    ...lastPart
                ].join('\n');
            } else {
                blockText = blockText.slice(0, maxBlockChars) + '\n  // ... [Compressed] ...';
            }
        }

        const formattedBlock = `\`\`\`${codeBlockLang}\n${blockText}\n\`\`\``;
        resultLines.push(formattedBlock);
        currentLength += formattedBlock.length;
        
        codeBlockLines = [];
        inCodeBlock = false;
    };

    for (const line of lines) {
        // Handle code block boundaries
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                flushCodeBlock();
            } else {
                inCodeBlock = true;
                codeBlockLang = line.replace('```', '').trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        // Filter out conversational filler in non-code lines
        const lowerLine = line.toLowerCase();
        if (
            lowerLine.startsWith('here is') || 
            lowerLine.startsWith('sure,') || 
            lowerLine.startsWith('i will') || 
            lowerLine.startsWith('let\'s') ||
            lowerLine.includes('hope this helps')
        ) {
            continue;
        }

        // Keep headers, lists, and key statements
        if (
            line.startsWith('#') || 
            line.trim().startsWith('-') || 
            line.trim().startsWith('*') || 
            line.trim().match(/^\d+\./) ||
            line.includes('**') ||
            line.includes('error') ||
            line.includes('success') ||
            line.includes('fail')
        ) {
            resultLines.push(line);
            currentLength += line.length + 1;
        }

        // Check if we are approaching the limit
        if (currentLength > maxChars) {
            break;
        }
    }

    if (inCodeBlock) {
        flushCodeBlock();
    }

    let compressed = resultLines.join('\n');
    if (compressed.trim().length === 0) {
        // Fallback to safe character truncation ensuring we don't leave open code blocks
        const suffix = '\n... (truncated)';
        return text.slice(0, maxChars - suffix.length) + suffix;
    }

    return compressed;
}

export function summarizeResponse(text: string): string {
    if (text.length <= 2000) return text;
    
    const tag = '\n\n<!-- TF-IDF SUMMARY -->';
    const limit = 2000 - tag.length;
    
    let compressed = compressSemantically(text, limit);
    if (!compressed.includes('<!-- TF-IDF SUMMARY -->')) {
        compressed = compressed + tag;
    }
    
    if (compressed.length > 2000) {
        compressed = compressed.slice(0, 2000 - tag.length) + tag;
    }
    
    return compressed;
}

const DATA_DEMAND_SIGNALS = [
    "could you provide", "I need more context", "I don't have access to",
    "read the file", "inspect file", "read file", "view file",
    /\b([a-zA-Z0-9_\-\/\\.]+\.(ts|js|py|go|rs|md|json|sql|txt))\b/i,
    /show me (all|the) (usages|references|calls|imports) of [`'"]?([A-Z]\w+|[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)[`'"]?/i,
    /where is [`'"]?([A-Z]\w+|[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)[`'"]? (used|defined|called|imported)/i,
    /find (all )?occurrences of [`'"]?([A-Z]\w+|[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)[`'"]?/i,
    /which files (use|import|reference|call) [`'"]?([A-Z]\w+|[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)[`'"]?/i,
    /what calls? [`'"]?([A-Z]\w+|[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)[`'"]?/i,
    /trace the (call|import|dependency) chain of [`'"]?([A-Z]\w+|[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)[`'"]?/i,
    /grep for [`'"]?([A-Z]\w+|[a-zA-Z0-9_\-\/\\.]+\.[a-zA-Z0-9]+)[`'"]?/i
];

export function detectDataDemand(responseContent: string): { triggered: boolean; cues: string[] } {
    const cues: string[] = [];
    for (const signal of DATA_DEMAND_SIGNALS) {
        if (typeof signal === 'string') {
            if (responseContent.toLowerCase().includes(signal.toLowerCase())) {
                cues.push(signal);
            }
        } else {
            const match = responseContent.match(signal);
            if (match) {
                cues.push(match[3] || match[0]);
            }
        }
    }
    return { triggered: cues.length > 0, cues };
}

export function compareTaskScope(originalTask: string, newResponse: string): boolean {
    const filePattern = /\b[a-zA-Z0-9_\-\/\\.]+\.(ts|js|py|go|rs|md)\b/g;
    const originalFiles = new Set(originalTask.match(filePattern) || []);
    const newFiles = new Set(newResponse.match(filePattern) || []);

    const newUnseenFiles = [...newFiles].filter(f => !originalFiles.has(f));
    return newUnseenFiles.length >= 2;
}

function cleanSubtaskContent(content: string): string {
    return content
        .replace(/^(sure|ok|here is|here's|i will|i have|successfully|let's|let me)[\s\S]*?\n\n/i, '')
        .trim();
}

function getTaskFiles(task: string): string[] {
    const filePattern = /\b[a-zA-Z0-9_\-\/\\.]+\.(ts|js|py|go|rs|md|json|sql|txt)\b/gi;
    const matches = task.match(filePattern) || [];
    return matches.map(f => f.replace(/\\/g, '/').toLowerCase());
}

interface QuantumRelationNode {
    task: string;
    distance: number;
    weight: number;
}

function calculateQuantumSemanticWeights(
    currentTask: string,
    history: SubtaskHistoryEntry[]
): QuantumRelationNode[] {
    const currentFiles = getTaskFiles(currentTask);
    const currentWords = new Set(currentTask.toLowerCase().split(/\W+/).filter(w => w.length > 3));

    return history.map((entry, idx) => {
        let distance = 3; // Default far distance

        // 1. Check direct file sharing (high entanglement)
        const entryFiles = getTaskFiles(entry.task).concat(entry.filesModified || []);
        const sharedFiles = entryFiles.filter(f => currentFiles.includes(f));
        if (sharedFiles.length > 0) {
            distance = 1;
        } else {
            // 2. Check semantic word overlap (medium entanglement)
            const entryWords = entry.task.toLowerCase().split(/\W+/).filter(w => w.length > 3);
            const overlap = entryWords.filter(w => currentWords.has(w));
            if (overlap.length >= 2) {
                distance = 2;
            } else {
                // 3. Check sequential order
                const stepsAgo = history.length - idx;
                if (stepsAgo === 1) {
                    distance = 2;
                } else {
                    distance = 2 + stepsAgo;
                }
            }
        }

        const weight = Math.exp(-distance);
        return {
            task: entry.task,
            distance,
            weight
        };
    });
}

async function executeSingleSubtask(
    currentTask: string,
    taskId: string,
    resolvedContext: Record<string, string>,
    context: PipelineContext,
    sessionId: string,
    projectDir: string,
    workspaceRoot: string | undefined,
    subtaskIteration: number,
    history: SubtaskHistoryEntry[],
    executor: LLMExecutor,
    subtaskContexts: string[],
    commsQueue: string[],
    promptQueue: string[]
): Promise<boolean> {
    let enrichmentCycleCount = 0;
    const MAX_ENRICHMENT_CYCLES = 2;
    let subtaskCompleted = false;

    while (!subtaskCompleted && enrichmentCycleCount <= MAX_ENRICHMENT_CYCLES) {
        // Subtask-local PDF reference resolution: this subtask's own text may reference a
        // pdf:// that wasn't part of the original top-level intake (e.g. a reference the
        // planner introduced mid-plan). Resolve it once here — cached into resolvedContext,
        // and the raw marker replaced with an opaque placeholder using the same token scheme
        // protectInjectedReferenceBlocks uses — so it flows through the rest of this function
        // exactly like an intake-resolved reference, and a re-entered enrichment cycle (this
        // loop runs again on the same `currentTask`, which by then already holds the
        // placeholder, not raw "pdf://...") never re-renders the page.
        const pdfMatches = [...currentTask.matchAll(REFERENCE_MARKER_REGEX)]
            .filter(m => (m.groups?.bProto ?? m.groups?.proto)?.toLowerCase() === 'pdf');
        if (pdfMatches.length > 0) {
            try {
                const { resolvePdfRef, MAX_PDF_PAGES_PER_PASS } = await import('../../tools/use-free-llm.js');
                let updatedTask = currentTask;
                for (let i = 0; i < pdfMatches.length; i++) {
                    const m = pdfMatches[i];
                    const uriPath = m.groups?.bPath ?? m.groups?.path;
                    if (!uriPath) continue;
                    // Same real cap as resolveFileRefs()'s top-level intake — this loop is a
                    // second, independent resolution path (subtask-local references), and
                    // without its own limit it would bypass the cap entirely for any subtask
                    // text that happens to carry many pdf:// markers.
                    if (i >= MAX_PDF_PAGES_PER_PASS) {
                        const sentinel = `[PDF-PAGE-DEFERRED: ${uriPath} — resolve in a follow-up request; max ${MAX_PDF_PAGES_PER_PASS} PDF pages per pass.]`;
                        updatedTask = updatedTask.replace(m[0], sentinel);
                        continue;
                    }
                    const res = await resolvePdfRef(uriPath, workspaceRoot);
                    if (res) {
                        const placeholder = `protected_ref_${taskId}_${Object.keys(resolvedContext).length}`;
                        resolvedContext[placeholder] = `${m[0]}\n\n${res.resolvedContent}`;
                        updatedTask = updatedTask.replace(m[0], placeholder);
                    }
                }
                currentTask = updatedTask;
            } catch (err) {
                console.error(`[AgenticMiddleware] Subtask-local PDF resolution failed: ${err}`);
            }
        }

        try {
            const userMessage = context.request.messages.find(m => m.role === 'user');
            const mainPrompt = userMessage ? getMessageContent(userMessage.content) : undefined;
            const userKeywords = context.keywords || [];
            const subtaskPrompt = await getIntelligentSystemPrompt({
                context: currentTask,
                mainPrompt,
                keywords: [...new Set(['mcp', 'memory', 'filesystem', ...userKeywords])],
                memory: (context as any).memoryContext,
                workspace: (context as any).grepContext,
                isSubtask: true,
                workspaceRoot: workspaceRoot
            });

            // Assemble quantum-weighted prior execution trail
            const totalHistoryBudget = 3000;
            const weights = calculateQuantumSemanticWeights(currentTask, history);
            const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

            let historySection = '';
            if (history.length > 0 && totalWeight > 0) {
                historySection = '\n\n## 🔄 PRIOR EXECUTION TRAIL (Quantum-Weighted Context)\n';
                for (let i = 0; i < history.length; i++) {
                    const entry = history[i];
                    const w = weights[i];
                    const normalizedWeight = w.weight / totalWeight;
                    const tokenBudget = Math.floor(totalHistoryBudget * normalizedWeight);

                    let formattedOutput = entry.output;
                    let priorityLabel = 'LOW (Status Only)';
                    if (tokenBudget > 1500) {
                        priorityLabel = 'HIGH (Full Detail)';
                        formattedOutput = compressSemantically(formattedOutput, 12000);
                    } else if (tokenBudget > 500) {
                        priorityLabel = 'MEDIUM (Summary)';
                        formattedOutput = compressSemantically(formattedOutput, 4000);
                    } else {
                        priorityLabel = 'LOW (Status Only)';
                        formattedOutput = compressSemantically(formattedOutput, 800);
                    }

                    historySection += `\n### |Subtask: ${entry.task}⟩ (Entanglement Distance: ${w.distance}, Priority: ${priorityLabel})\n`;
                    historySection += `**Status**: Completed\n`;
                    if (entry.filesModified && entry.filesModified.length > 0) {
                        historySection += `**Files Modified**: ${entry.filesModified.map(f => `\`${f}\``).join(', ')}\n`;
                    }
                    historySection += `**Execution Output**:\n\`\`\`\n${formattedOutput}\n\`\`\`\n`;
                }
            }

            // Resolve protected_ref_N placeholders back to full injected content only here, right
            // before the prompt actually shown to the LLM is built. Everything upstream of this
            // point (decomposeGoal, buildExecutionPlan, queue storage, logs, history) only ever
            // sees the short placeholder form — this is the one place the real content gets
            // substituted back in, resolved fresh from the retained map rather than re-derived.
            const resolvedTaskText = Object.keys(resolvedContext).length > 0
                ? restoreProtectedReferenceBlocks(currentTask, new Map(Object.entries(resolvedContext)))
                : currentTask;

            const taskHeader = `\n\n## 📝 CURRENT SUBTASK\nYou are currently executing this subtask:\n- **Task**: ${resolvedTaskText}\n\nStrictly focus on this subtask using the tools provided.${historySection}`;

            const messages = context.request.messages;
            const sysMsgIdx = messages.findIndex(m => m.role === 'system');
            if (sysMsgIdx !== -1) {
                messages[sysMsgIdx] = { role: 'system', content: `${subtaskPrompt}${taskHeader}` };
            } else {
                messages.unshift({ role: 'system', content: `${subtaskPrompt}${taskHeader}` });
            }
        } catch (err) {
            console.error(`[AgenticMiddleware] Failed to inject subtask prompt: ${err}`);
        }

        addToQueues(commsQueue, promptQueue, 'subtask_start', {
            subtask: currentTask,
            iteration: subtaskIteration,
            enrichmentCycle: enrichmentCycleCount,
            messages: context.request.messages
        });

        const readKeywords = /\b(?:read|view|inspect|show|print|cat|get|display)\b/i;
        const filePattern = /(?:[a-zA-Z]:)?[\\/][a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+|\b([a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+)\b/;
        const isSimpleRead = readKeywords.test(currentTask) && filePattern.test(currentTask);
        let handledProactively = false;
        
        if (isSimpleRead) {
            const match = currentTask.match(filePattern);
            if (match) {
                const filename = match[0];
                try {
                    const fullPath = workspaceRoot ? path.resolve(workspaceRoot, filename) : path.resolve(process.cwd(), filename);
                    let exists = false;
                    try {
                        await fs.access(fullPath);
                        exists = true;
                    } catch {}

                    if (exists) {
                        const content = await fs.readFile(fullPath, 'utf8');
                        const MAX_FILE_INJECT_BYTES = 50_000;
                        const truncated = content.length > MAX_FILE_INJECT_BYTES
                            ? content.slice(0, MAX_FILE_INJECT_BYTES) + '\n... [truncated]'
                            : content;
                        const extension = path.extname(filename).slice(1) || 'text';
                        const proactiveMsg = `[PROACTIVE-CONTEXT] Content of \`${filename}\`:\n\n\`\`\`${extension}\n${truncated}\n\`\`\``;
                        context.request.messages.push({ role: 'user', content: proactiveMsg });
                        subtaskContexts.push(`📄 **File Injected**: \`${filename}\` (${truncated.length} chars)\n${excerptForLog(truncated)}`);
                        addToQueues(commsQueue, promptQueue, 'proactive_context_injected', {
                            file: filename
                        });
                        
                        context.response = {
                            choices: [{
                                message: {
                                    role: 'assistant',
                                    content: `Successfully read and inspected the file contents:\n\n\`\`\`${extension}\n${truncated}\n\`\`\``
                                }
                            }]
                        } as any;
                        handledProactively = true;
                    }
                } catch (err) {
                    // ignore
                }
            }
        }

        // Everything from here on makes real LLM calls (executor.prompt()) that can throw
        // (network errors, provider exceptions, etc.). Those must not escape uncaught: the
        // caller's `if (!success || !responseContent)` branch (AgenticMiddleware.ts, in the
        // sequential-execution while loop) already turns a `false` return into a proper HITL
        // pause — sets q.paused/q.promptId, persists, and returns a `continue <id>` message —
        // exactly the recoverable state a crash should land in. Before this try/catch, an
        // uncaught exception here skipped that branch entirely, leaving nowQueue stuck
        // non-empty on disk with paused:false: invisible to the user, and every future call
        // against the same session would silently resume and re-crash on the same subtask
        // forever, with no `continue` prompt ever shown.
        try {
            if (!handledProactively) {
                const { ImageRouterMiddleware } = await import('./ImageRouterMiddleware.js');
                const imageRouter = new ImageRouterMiddleware(executor);
                const processedMessages = await imageRouter.processImageMessages(context.request.messages);

                const response = await executor.prompt(processedMessages, context.request.model, {
                    taskType: context.taskType || 'coding',
                    google_search: context.request.google_search,
                    sessionId,
                    agentic: false
                });
                context.response = response;
            }
        } catch (err) {
            console.error(`[AgenticMiddleware] Subtask execution crashed: ${err}`);
            return false;
        }

        const responseContent = getResponseContent(context);
        if (!responseContent) {
            subtaskCompleted = true;
            break;
        }

        addToQueues(commsQueue, promptQueue, 'subtask_response', {
            subtask: currentTask,
            response: responseContent
        });

        if (detectContextSignal(responseContent)) {
            enrichmentCycleCount++;
            if (enrichmentCycleCount > MAX_ENRICHMENT_CYCLES) {
                subtaskCompleted = true;
                break;
            }

            const cues = extractCues(responseContent);
            const gatheredContextLines: string[] = [];

            if (cues.length > 0) {
                const results = await ContextGatherer.gatherContext({
                    workspaceRoot: workspaceRoot || process.cwd(),
                    query: cues.join(' '),
                    keywords: cues
                });
                if (results && results.length > 0) {
                    gatheredContextLines.push(...results);
                }
            } else {
                const entity = extractEntity(responseContent);
                const results = await ContextGatherer.gatherContext({
                    workspaceRoot: workspaceRoot || process.cwd(),
                    query: entity
                });
                if (results && results.length > 0) {
                    gatheredContextLines.push(...results);
                }
            }

            if (gatheredContextLines.length > 0) {
                const uniqueLines = [...new Set(gatheredContextLines)];
                const enrichmentMsg = `[CONTEXT-ENRICHMENT] Here is the gathered context from the workspace:\n\n${uniqueLines.join('\n')}`;
                context.request.messages.push({ role: 'user', content: enrichmentMsg });
                subtaskContexts.push(`🔍 **Grep Context**: Injected ${uniqueLines.length} lines matching: \`${cues.join(', ') || 'workspace query'}\`\n${excerptForLog(uniqueLines.join('\n'))}`);
            } else {
                const entityName = cues.length > 0 ? cues.join(', ') : 'requested content';
                const unavailableMsg = `[CONTEXT-UNAVAILABLE] ${entityName} was not found in the workspace. Please proceed with available information.`;
                context.request.messages.push({ role: 'user', content: unavailableMsg });
            }
            continue;
        }

        const verifyReport = detectHallucination(responseContent);
        const isFail = verifyReport.status === 'FAIL' || verifyReport.status === 'LOOP_DETECTED';

        if (isFail) {
            const lines = responseContent.split('\n');
            const trailingQuestions = lines
                .map(l => l.trim())
                .filter(l => l.endsWith('?'))
                .slice(-3);

            if (trailingQuestions.length > 0) {
                addToQueues(commsQueue, promptQueue, 'hallucination_recovery_attempt', {
                    subtask: currentTask,
                    reason: verifyReport.reason,
                    questions: trailingQuestions
                });

                const recoveryAnswers: string[] = [];
                for (const question of trailingQuestions) {
                    const answers = await ContextGatherer.gatherContext({
                        workspaceRoot: workspaceRoot || process.cwd(),
                        query: question
                    });
                    if (answers && answers.length > 0) {
                        recoveryAnswers.push(...answers);
                    }
                }

                if (recoveryAnswers.length > 0) {
                    const recoveryMsg = `[RECOVERY-CONTEXT] We noticed a potential hallucination or missing info. Here is the gathered recovery context:\n\n${recoveryAnswers.join('\n')}`;
                    context.request.messages.push({ role: 'user', content: recoveryMsg });
                    subtaskContexts.push(`🛡️ **Recovery Context**: Injected ${recoveryAnswers.length} lines to resolve hallucination.\n${excerptForLog(recoveryAnswers.join('\n'))}`);
                    
                    let recoveryResponse;
                    try {
                        recoveryResponse = await executor.prompt(context.request.messages, context.request.model, {
                            taskType: context.taskType || 'coding',
                            google_search: context.request.google_search,
                            sessionId,
                            agentic: false
                        });
                    } catch (err) {
                        console.error(`[AgenticMiddleware] Hallucination-recovery call crashed: ${err}`);
                        return false;
                    }
                    context.response = recoveryResponse;
                    
                    if (recoveryResponse) {
                        const recoveryResponseContent = getResponseContent(context);
                        if (recoveryResponseContent) {
                            const secondVerify = detectHallucination(recoveryResponseContent);
                            const isSecondFail = secondVerify.status === 'FAIL' || secondVerify.status === 'LOOP_DETECTED';
                            if (isSecondFail) {
                                context.request.messages.push({ role: 'assistant', content: recoveryResponseContent });
                            } else {
                                const summarized = summarizeResponse(recoveryResponseContent);
                                context.request.messages.push({ role: 'assistant', content: summarized });
                                if (context.wsHash) {
                                    await appendKnowledge(projectDir, sessionId, recoveryResponseContent);
                                }
                            }
                        }
                    }
                    subtaskCompleted = true;
                    break;
                }
            }

            context.request.messages.push({ role: 'assistant', content: responseContent });
            subtaskCompleted = true;
            break;
        }

    const summarized = summarizeResponse(responseContent);
        context.request.messages.push({ role: 'assistant', content: summarized });
        if (context.wsHash) {
            await appendKnowledge(projectDir, sessionId, responseContent);
        }
        subtaskCompleted = true;
    }

    return true;
}

/**
 * Drains the remaining nowQueue for a session after AgenticMiddleware.execute() has
 * already yielded a partial result at the time budget. Runs detached (not awaited by the
 * request handler) — RunRegistry.isRunning(sessionId) keeps other calls for this session
 * from starting a second concurrent run while this executes; action:'status' reads
 * RunRegistry.get(sessionId) for progress; action:'abort' cancels via runInfo.controller.
 */
async function continueQueueInBackground(
    sessionId: string,
    projectDir: string,
    workspaceRoot: string | undefined,
    executor: LLMExecutor,
    baseContext: PipelineContext,
    commsQueue: string[],
    promptQueue: string[],
    runInfo: RunInfo
): Promise<void> {
    try {
        const q = await getOrLoadState(sessionId);
        let iterations = 0;
        const MAX_ITERATIONS = 20;
        while (q.nowQueue.length > 0 && iterations < MAX_ITERATIONS) {
            if (runInfo.controller.signal.aborted) {
                console.error(`[AgenticMiddleware] Background run aborted for session=${sessionId}`);
                break;
            }
            iterations++;
            const taskNode = q.nowQueue[0];

            const clonedCtx: PipelineContext = {
                ...baseContext,
                request: {
                    ...baseContext.request,
                    messages: baseContext.request.messages.map(m => ({ ...m }))
                }
            } as any;

            await logChatTurn(sessionId, { role: 'subtask_start', tool: 'Agentic Subtask (background)', content: taskNode.task });

            let success = false;
            try {
                success = await executeSingleSubtask(
                    taskNode.task, taskNode.id, (q.resolvedContext ??= {}), clonedCtx,
                    sessionId, projectDir, workspaceRoot, iterations, q.history || [],
                    executor, [], commsQueue, promptQueue
                );
            } catch (err) {
                console.error(`[AgenticMiddleware] Background subtask crashed: ${err}`);
                success = false;
            }

            const responseContent = getResponseContent(clonedCtx);
            if (!success || !responseContent) {
                await logChatTurn(sessionId, { role: 'error', tool: 'Agentic Subtask (background)', content: `Failed: ${taskNode.task}` });
                if (!q.promptId) q.promptId = Math.random().toString(36).substring(2, 8).toUpperCase();
                q.paused = true;
                q.pauseReason = 'failed';
                await persistState(sessionId, projectDir);
                break;
            }

            await logChatTurn(sessionId, {
                role: 'subtask_response',
                tool: 'Agentic Subtask (background)',
                content: `Completed: ${taskNode.task}`,
                output: responseContent,
                model: clonedCtx.response?.model,
                provider: (clonedCtx.response as any)?._providerId
            });

            if (!q.history) q.history = [];
            q.history.push({
                task: taskNode.task,
                taskId: taskNode.id,
                output: responseContent,
                filesModified: getTaskFiles(responseContent),
                timestamp: Date.now(),
                model: clonedCtx.response?.model,
                provider: (clonedCtx.response as any)?._providerId
            });

            q.nowQueue = q.nowQueue.filter(e => e.id !== taskNode.id);
            await persistState(sessionId, projectDir);
            RunRegistry.progress(sessionId, taskNode.task, q.history.length, q.nowQueue.length);
        }

        // fix: if we hit the iteration cap with tasks still pending, surface the halt
        // clearly instead of silently stopping. Without this, action:'status' shows
        // remaining queue items with no indication that background processing has halted.
        if (iterations >= MAX_ITERATIONS && q.nowQueue.length > 0 && !runInfo.controller.signal.aborted) {
            const remaining = q.nowQueue.length;
            const haltMsg = `Background execution halted after ${MAX_ITERATIONS} iterations with ${remaining} task(s) still pending. Re-submit to continue.`;
            console.error(`[AgenticMiddleware] ${haltMsg} session=${sessionId}`);
            q.paused = true;
            q.pauseReason = 'iteration_limit';
            await persistState(sessionId, projectDir);
            RunRegistry.finish(sessionId, haltMsg);
            return;
        }

        if (q.nowQueue.length === 0 && !runInfo.controller.signal.aborted) {
            q.paused = false;
            q.pauseReason = undefined;
            await persistState(sessionId, projectDir);
        }
        RunRegistry.finish(sessionId);
    } catch (err: any) {
        console.error(`[AgenticMiddleware] Background continuation failed for session=${sessionId}:`, err);
        RunRegistry.finish(sessionId, err?.message || String(err));
    }
}

function getOriginalUserContent(content: string): string {
    const marker = '// FULL file content here (never partial diffs)\n```';
    const index = content.indexOf(marker);
    if (index !== -1) {
        return content.substring(index + marker.length).trim();
    }
    return content;
}

export class AgenticMiddleware implements Middleware {
    name = 'AgenticMiddleware';
    private executor: LLMExecutor;

    constructor(executor?: LLMExecutor) {
        this.executor = executor || new LLMExecutor();
    }

    private limitSubtasks(steps: QueueTask[]): QueueTask[] {
        if (steps.length > 3) {
            return steps.slice(0, 3);
        }
        return steps;
    }

    async gatherGrepContext(workspaceRoot: string, query: string): Promise<string[]> {
        return ContextGatherer.gatherContext({ workspaceRoot, query });
    }

    async execute(context: PipelineContext, next: NextFunction): Promise<void> {
        const commsQueue: string[] = [];
        const promptQueue: string[] = [];
        try {
            const startMs = Date.now();
        if (context.isOnePass) {
            await next();
            return;
        }

        const isAgenticExplicitlyRequested = context.agentic === true || context.request?.agentic === true;
        const sessionId: string | undefined = context.sessionId || (context.request as any)?.sessionId;

        const iterationCountKey = `_iteration_${sessionId}`;
        const iterationCountValue = context[iterationCountKey];
        const iterationCount: number = typeof iterationCountValue === 'number' ? iterationCountValue : 0;
        context[iterationCountKey] = iterationCount + 1;

        if (process.env.ENABLE_AGENTIC_MIDDLEWARE !== 'true' && !isAgenticExplicitlyRequested) {
            await next();
            return;
        }

        if (iterationCount > 10) {
            console.error(`[AgenticMiddleware] Loop protection triggered for session=${sessionId}`);
            await next();
            return;
        }

        if (!sessionId) {
            console.error('[AgenticMiddleware] Mandatory sessionId missing. Bypassing agentic layer.');
            await next();
            return;
        }

        const workspaceRoot: string | undefined = context.workspaceRoot || (context.request as any)?.workspace_root;
        const projectDir = await ensureProjectFiles(sessionId, workspaceRoot);
        const q = await getOrLoadState(sessionId);

        // A background continuation from a previous budget-yielded call may still be running
        // for this session. Rather than starting a second concurrent run over the same
        // on-disk QueueState (interleaved mutations, duplicated file edits), return a status
        // snapshot — this also turns a client's timeout-and-retry into free polling.
        if (RunRegistry.isRunning(sessionId)) {
            const runInfo = RunRegistry.get(sessionId)!;
            context.response = {
                id: `status-${Date.now()}`,
                object: 'chat.completion',
                created: Date.now(),
                model: 'agentic-status',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: `⏳ **Still running in the background**\n\n- Completed: ${runInfo.completedCount}/${runInfo.totalCount || runInfo.completedCount + q.nowQueue.length}\n- Last finished subtask: ${runInfo.lastSubtask || '(none yet)'}\n- Remaining in queue: ${q.nowQueue.length}\n\nRe-call with the same sessionId to poll again, or use \`action: 'status'\` / \`action: 'abort'\`.`
                    },
                    finish_reason: 'stop'
                }]
            } as any;
            return;
        }

        const deadline = Date.now() + SUBTASK_BUDGET_MS;
        const runInfo = RunRegistry.start(sessionId);
        let deferredToBackground = false;
        try {

        const userMessage = context.request.messages.find(m => m.role === 'user');
        let userContent = userMessage ? getMessageContent(userMessage.content).trim() : undefined;
        if (userContent) {
            userContent = getOriginalUserContent(userContent);
        }

        // Budget pauses (yielded when SUBTASK_BUDGET_MS was exceeded, see the loop below)
        // auto-resume on the very next call for this sessionId — unlike terminal/failure
        // pauses, they don't require the client to know or supply a promptId.
        if (q.paused && q.pauseReason === 'budget') {
            q.paused = false;
            q.pauseReason = undefined;
        }

        // Resume check: "continue <prompt_id> <input-for-next-subtask>"
        if (userContent) {
            const continueMatch = userContent.match(/^continue\s+([a-z0-9]{6})\s*(.*)/i);
            if (continueMatch) {
                const suppliedId = continueMatch[1].toUpperCase();
                const inputForNext = continueMatch[2];

                if (q.paused && q.promptId === suppliedId) {
                    console.error(`[AgenticMiddleware] Resume command matched! Resuming session=${sessionId} with input: ${inputForNext}`);
                    q.paused = false;
                    if (inputForNext && q.nowQueue.length > 0) {
                        q.nowQueue[0].task = `${q.nowQueue[0].task} (User input: ${inputForNext})`;
                    }
                    persistStateDebounced(sessionId, projectDir);
                } else {
                    console.error(`[AgenticMiddleware] Resume failed: suppliedId=${suppliedId}, expected=${q.promptId}, paused=${q.paused}`);
                }
            }
        }

        (context as any).isSubtask = q.nowQueue.length > 0;

        if (userContent && q.nowQueue.length === 0) {
            // classifyIntent()'s heuristics (hasFile/hasTask/hasQuestion) must run on the
            // user's actual typed text, not on injected pdf://file://artifact:// content —
            // otherwise capitalized words or keywords inside an injected PDF page (e.g. a
            // filename like "Cyber_Forensics.pdf") can flip a plain "summarize this page"
            // ask into CLEAR_TASK, sending it through full agentic subtask decomposition
            // instead of the cheaper QUESTION path.
            const { tokenized: intentTokenized, placeholders: intentPlaceholders } = protectInjectedReferenceBlocks(userContent);
            let intent = classifyIntent(intentTokenized);
            if (intent === 'CONFUSED' && intentPlaceholders.size > 0) {
                // A pdf://file://artifact:// reference was already resolved — that's proof
                // of a concrete target, so this isn't genuinely ambiguous. Route to QUESTION
                // instead: it builds its prompt from the full resolved userContent AND
                // includes context.grepContext (already populated with any relevant wiki
                // knowledge by WorkspaceContextMiddleware upstream), so the model answers
                // directly instead of asking where a file is when its content is already in
                // front of it. disambiguateConfusedIntent (the CONFUSED path) gets neither —
                // it would ask a clarifying question about content it was just shown.
                console.error(`[AgenticMiddleware] CONFUSED intent upgraded to QUESTION: reference content already resolved.`);
                intent = 'QUESTION';
            }
            // Human-readable labels describing what context (if any) was injected for this
            // turn — surfaced to the dashboard the same way subtask_response entries already
            // expose `contextInjected`, so CONFUSED/QUESTION turns aren't a blind spot.
            const turnContextInjected: string[] = [];
            if (intentPlaceholders.size > 0) {
                const resolvedExcerpt = excerptForLog([...intentPlaceholders.values()].join('\n---\n'));
                turnContextInjected.push(`📄 **Reference Content Resolved**: ${intentPlaceholders.size} file/PDF reference(s) injected into context.\n${resolvedExcerpt}`);
            }
            const memoryContextStr = (context as any).memoryContext;
            if (memoryContextStr) turnContextInjected.push(`🧠 **Workspace Memory Injected**\n${excerptForLog(String(memoryContextStr))}`);
            const grepContextStr = (context as any).grepContext;
            if (grepContextStr) turnContextInjected.push(`📚 **Wiki Knowledge Injected**\n${excerptForLog(String(grepContextStr))}`);

            if (intent === 'CONFUSED') {
                console.error(`[AgenticMiddleware] User intent classified as CONFUSED. Executing bare clarification.`);
                await logChatTurn(sessionId, { role: 'user', tool: 'use_free_llm', content: userContent, contextInjected: turnContextInjected });
                const clarification = await disambiguateConfusedIntent(userContent, workspaceRoot);
                context.response = {
                    id: `clarification-${Date.now()}`,
                    object: 'chat.completion',
                    created: Date.now(),
                    model: 'clarification-model',
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: clarification.markdown },
                        finish_reason: 'stop'
                    }]
                } as any;
                await logChatTurn(sessionId, { role: 'assistant', tool: 'Agentic Output', content: clarification.markdown });
                return;
            }

            if (intent === 'QUESTION') {
                console.error(`[AgenticMiddleware] User intent classified as QUESTION. Skipping decomposition loop.`);
                await logChatTurn(sessionId, { role: 'user', tool: 'use_free_llm', content: userContent, contextInjected: turnContextInjected });
                try {
                    const groundingGate: string = (context as any).groundingGate || '';
                    const userKeywords = context.keywords || [];
                    const questionPrompt = await getIntelligentSystemPrompt({
                        context: userContent,
                        mainPrompt: userContent,
                        keywords: isAgenticExplicitlyRequested ? ['agentic', 'orchestration', ...userKeywords] : userKeywords,
                        memory: (context as any).memoryContext,
                        workspace: (context as any).grepContext,
                        isSubtask: false,
                        workspaceRoot: workspaceRoot
                    });
                    const sysMsg = context.request.messages.find(m => m.role === 'system');
                    if (sysMsg) {
                        sysMsg.content = `${questionPrompt}${groundingGate}`;
                    } else {
                        context.request.messages.unshift({ role: 'system', content: `${questionPrompt}${groundingGate}` });
                    }
                } catch (err) {
                    console.error(`[AgenticMiddleware] Failed to inject system prompt: ${err}`);
                }

                const { getSharedRouter } = await import('../../pipeline/instances.js');
                await getSharedRouter().execute(context, async () => { });

                const deferredPages = extractDeferredPdfPages(userContent);
                if (deferredPages.length > 0 && context.response?.choices?.[0]?.message) {
                    const { MAX_PDF_PAGES_PER_PASS } = await import('../../tools/use-free-llm.js');
                    const msg = context.response.choices[0].message as any;
                    const currentContent = getMessageContent(msg.content);
                    msg.content = appendDeferredPagesNotice(currentContent, deferredPages, MAX_PDF_PAGES_PER_PASS);
                }

                const questionResponseContent = getMessageContent(context.response?.choices?.[0]?.message?.content ?? '');
                await logChatTurn(sessionId, {
                    role: 'assistant',
                    tool: 'Agentic Output',
                    content: questionResponseContent,
                    contextInjected: turnContextInjected,
                    model: context.response?.model,
                    provider: (context.response as any)?._providerId
                });
                return;
            }
        }

        if (userContent && detectResearchIntent(userContent)) {
            logResearchValidation(sessionId, userContent, 'pre-execution-research-detection');
            if (context.request.google_search === undefined) {
                context.request.google_search = true;
                console.error(`[AgenticMiddleware] Research intent detected, auto-enabling google_search for session=${sessionId}`);
            }
        }

        let executionPlanBrief = '';
        if (userContent && q.nowQueue.length === 0) {
            // Log the user's turn to the chat log
            await logChatTurn(sessionId, { role: 'user', tool: 'use_free_llm', content: userContent });

            const { tasks: steps, resolvedContext } = decomposeGoal(userContent);
            const limitedSteps = this.limitSubtasks(steps);

            const plan = await buildExecutionPlan(limitedSteps, workspaceRoot || process.cwd());
            executionPlanBrief = `<details><summary>🔍 Task Plan</summary>\n\n${plan.userBrief}\n</details>\n\n`;

            q.nowQueue.push(...limitedSteps);
            q.resolvedContext = { ...(q.resolvedContext || {}), ...resolvedContext };
        }

        persistStateDebounced(sessionId, projectDir);

        let subtaskIteration = 0;
        const MAX_SUBTASKS = 3;
        let globalRetrospectionCount = 0;

        if (q.nowQueue.length === 0) {
            await next();
        }

        while (q.nowQueue.length > 0 && subtaskIteration < MAX_SUBTASKS) {
            if (Date.now() > deadline) {
                // Out of time budget. Yield a partial result now (client sees progress
                // instead of a hard timeout) and keep draining the remaining queue on a
                // detached background run — the next call for this sessionId will either
                // see it still running (status snapshot) or find the queue already drained.
                if (!q.promptId) {
                    q.promptId = Math.random().toString(36).substring(2, 8).toUpperCase();
                }
                q.paused = true;
                q.pauseReason = 'budget';
                await persistState(sessionId, projectDir);

                const doneSoFar = (q.history || []).map(h => `### ✅ Subtask: ${h.task}\n\n${cleanSubtaskContent(h.output)}`).join('\n\n');
                const partialContent = `${executionPlanBrief}${doneSoFar}\n\n⏳ **Time budget reached — continuing in the background**\n\n- Completed: ${q.history?.length || 0} subtask(s)\n- Remaining in queue: ${q.nowQueue.length}\n\nRe-call with the same sessionId (or \`action: 'continue'\` / \`continue ${q.promptId}\`) to fetch the rest.`;
                context.response = {
                    id: `budget-pause-${Date.now()}`,
                    object: 'chat.completion',
                    created: Date.now(),
                    model: 'gemini-3.1-flash-lite',
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: partialContent },
                        finish_reason: 'stop'
                    }]
                } as any;

                deferredToBackground = true;
                runInfo.totalCount = q.nowQueue.length + (q.history?.length || 0);
                runInfo.completedCount = q.history?.length || 0;
                runInfo.promptId = q.promptId;
                const bgContext: PipelineContext = {
                    ...context,
                    request: { ...context.request, messages: context.request.messages.map(m => ({ ...m })) }
                } as any;
                void continueQueueInBackground(sessionId, projectDir, workspaceRoot, this.executor, bgContext, commsQueue, promptQueue, runInfo);
                break;
            }

            subtaskIteration++;

            // Prune old messages in context.request.messages to avoid context bloat
            const KEEP_LAST_N_MESSAGES = 6;
            const systemMsgs = context.request.messages.filter(m => m.role === 'system');
            const nonSystemMsgs = context.request.messages.filter(m => m.role !== 'system');
            if (nonSystemMsgs.length > KEEP_LAST_N_MESSAGES) {
                context.request.messages = [
                    ...systemMsgs,
                    ...nonSystemMsgs.slice(-KEEP_LAST_N_MESSAGES)
                ];
            }
            
            const plan = await buildExecutionPlan(q.nowQueue, workspaceRoot || process.cwd());
            const phase1Tasks = plan.phase1;
            if (phase1Tasks.length === 0) break;

            const isParallel = phase1Tasks.every(t => t.lane === 'parallel');
            
            const registry = ProviderRegistry.getInstance();
            const activeProvider = registry.getAvailableProviders().find(p => p.id !== 'siliconflow') || registry.getProvider('gemini');
            const isLowThroughput = activeProvider && activeProvider.rateLimits?.rpm && activeProvider.rateLimits.rpm <= 15;

            if (isParallel && !isLowThroughput && phase1Tasks.length > 1) {
                console.error(`[AgenticMiddleware] Parallel execution: running ${phase1Tasks.length} tasks concurrently`);
                
                // Pre-parallel indexing run: index once so children are fully up-to-date and lock-free.
                // This single call is what prevents concurrent-indexing races between subtasks below —
                // subtasks execute via executeSingleSubtask() directly and never re-enter the pipeline
                // (so they never re-trigger WorkspaceContextMiddleware's own indexing pass).
                if (workspaceRoot) {
                    try {
                        console.error(`[AgenticMiddleware] Running pre-parallel workspace indexing...`);
                        const indexer = new WorkspaceIndexer(workspaceRoot);
                        await indexer.indexWorkspace(workspaceRoot, false);
                    } catch (err) {
                        console.error(`[AgenticMiddleware] Pre-parallel workspace indexing failed: ${err}`);
                    }
                }

                const parallelPromises = phase1Tasks.map(async (t) => {
                    const clonedCtx: PipelineContext = {
                        ...context,
                        request: {
                            ...context.request,
                            messages: context.request.messages.map(m => ({ ...m }))
                        }
                    } as any;
                    
                    await executeSingleSubtask(t.task, t.id, (q.resolvedContext ??= {}), clonedCtx, sessionId, projectDir, workspaceRoot, subtaskIteration, q.history || [], this.executor, [], commsQueue, promptQueue);
                    return clonedCtx;
                });

                const results = await Promise.allSettled(parallelPromises);
                
                const outputs: string[] = [];
                const errors: string[] = [];
                
                results.forEach((res, idx) => {
                    const taskName = phase1Tasks[idx].task;
                    if (res.status === 'fulfilled') {
                        const clonedCtx = res.value;
                        const content = getResponseContent(clonedCtx);
                        if (content) {
                            const cleaned = cleanSubtaskContent(content);
                            outputs.push(`### ✅ Subtask: ${taskName}\n\n${cleaned}`);
                            context.request.messages.push({ role: 'assistant', content });
                            // Record to history (previously only the sequential branch did this,
                            // so a partially-completed parallel round was forgotten on resume and
                            // its subtasks got silently redone).
                            if (!q.history) q.history = [];
                            q.history.push({
                                task: taskName,
                                taskId: phase1Tasks[idx].id,
                                output: content,
                                filesModified: getTaskFiles(content),
                                timestamp: Date.now(),
                                model: clonedCtx.response?.model,
                                provider: (clonedCtx.response as any)?._providerId
                            });
                        } else {
                            errors.push(`Subtask ${idx + 1} failed or returned empty: ${taskName}`);
                        }
                    } else {
                        errors.push(`Subtask ${idx + 1} crashed: ${taskName} - ${res.reason?.message || res.reason}`);
                    }
                });

                const combinedOutput = outputs.join('\n\n');
                let finalContent = combinedOutput;
                if (errors.length > 0) {
                    finalContent += `\n\n### ⚠️ Objections/Failures:\n- ${errors.join('\n- ')}\n*Use "git checkout -- <files>" to discard partial changes.*`;
                } else {
                    const firstTask = phase1Tasks[0]?.task || '';
                    const action = firstTask.toLowerCase().includes('fix') || firstTask.toLowerCase().includes('bug') ? 'fix' : 'feat';
                    let scopeStr = '';
                    const pathMatch = firstTask.match(/\/([a-zA-Z0-9_\-]+)\/[a-zA-Z0-9_\-]+\.[a-z]+/i) ||
                                      firstTask.match(/(?:^|\s)([a-zA-Z0-9_\-]+)\/[a-zA-Z0-9_\-]+/i) ||
                                      firstTask.match(/([a-zA-Z0-9_\-]+)\.(?:[a-z0-9]+)/i);
                    if (pathMatch) {
                        scopeStr = `(${pathMatch[1].toLowerCase()})`;
                    }
                    finalContent += `\n\n### 🚀 Task Completed Successfully!\n*Suggested: Run "git commit -m \"${action}${scopeStr}: complete task execution\"" to save your progress.*`;
                }

                if (executionPlanBrief) {
                    finalContent = executionPlanBrief + finalContent;
                }

                context.response = {
                    id: `parallel-${Date.now()}`,
                    object: 'chat.completion',
                    created: Date.now(),
                    model: activeProvider?.models[0]?.id || 'gemini-3.1-flash-lite',
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: finalContent },
                        finish_reason: 'stop'
                    }]
                } as any;

                q.nowQueue = q.nowQueue.filter(e => !phase1Tasks.some(t => t.id === e.id));
                await persistState(sessionId, projectDir);

            } else {
                const currentTaskNode = phase1Tasks[0];
                const currentTask = currentTaskNode.task;

                // 1. Detect if subtask requires a terminal run
                const requiresTerminal = (/\b(?:run|execute|spawn|start|launch|npm|pip|cargo|go run|sh|bash|cmd|terminal|command)\b/i.test(currentTask) || /\bpython\s+/i.test(currentTask)) && !currentTask.includes('(User input:');
                
                if (requiresTerminal && !q.paused) {
                    if (!q.promptId) {
                        q.promptId = Math.random().toString(36).substring(2, 8).toUpperCase();
                    }
                    q.paused = true;
                    q.pauseReason = 'terminal';
                    await persistState(sessionId, projectDir);

                    console.error(`[AgenticMiddleware] Pausing pipeline for terminal run. promptId=${q.promptId}`);
                    
                    context.response = {
                        id: `pause-${Date.now()}`,
                        object: 'chat.completion',
                        created: Date.now(),
                        model: activeProvider?.models[0]?.id || 'gemini-3.1-flash-lite',
                        choices: [{
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: `⚠️ **Pipeline Paused for Terminal Action**\n\nThe next subtask requires executing a terminal command:\n- **Subtask**: \`${currentTask}\`\n\nPlease execute the command in your terminal. Once completed, resume the pipeline by replying with:\n\`\`\`\ncontinue ${q.promptId} <any results or output from the command>\n\`\`\``
                            },
                            finish_reason: 'stop'
                        }]
                    } as any;
                    return;
                }

                if (q.paused) {
                    context.response = {
                        id: `pause-${Date.now()}`,
                        object: 'chat.completion',
                        created: Date.now(),
                        model: activeProvider?.models[0]?.id || 'gemini-3.1-flash-lite',
                        choices: [{
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: `⚠️ **Pipeline is currently Paused**\n\nPlease resume by replying with:\n\`\`\`\ncontinue ${q.promptId} <any results or output>\n\`\`\``
                            },
                            finish_reason: 'stop'
                        }]
                    } as any;
                    return;
                }

                console.error(`[AgenticMiddleware] Sequential execution: ${currentTask}`);

                if (isLowThroughput && isParallel) {
                    await new Promise(r => setTimeout(r, 500));
                }

                // Log subtask start
                const subtaskContexts: string[] = [];
                await logChatTurn(sessionId, { role: 'subtask_start', tool: 'Agentic Subtask', content: currentTask });

                const success = await executeSingleSubtask(currentTask, currentTaskNode.id, (q.resolvedContext ??= {}), context, sessionId, projectDir, workspaceRoot, subtaskIteration, q.history || [], this.executor, subtaskContexts, commsQueue, promptQueue);
                
                const responseContent = getResponseContent(context);

                if (!success || !responseContent) {
                    // Log subtask failure
                    await logChatTurn(sessionId, { role: 'error', tool: 'Agentic Subtask', content: `Failed: ${currentTask}` });
                    if (!q.promptId) {
                        q.promptId = Math.random().toString(36).substring(2, 8).toUpperCase();
                    }
                    q.paused = true;
                    q.pauseReason = 'failed';
                    await persistState(sessionId, projectDir);

                    context.response = {
                        id: `failed-pause-${Date.now()}`,
                        object: 'chat.completion',
                        created: Date.now(),
                        model: activeProvider?.models[0]?.id || 'gemini-3.1-flash-lite',
                        choices: [{
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: `❌ **Subtask Execution Failed**\n\n- **Failed Subtask**: \`${currentTask}\`\n\nYou can address the issue and resume/continue the subtask execution by replying with:\n\`\`\`\ncontinue ${q.promptId} <any results or instructions>\n\`\`\``
                            },
                            finish_reason: 'stop'
                        }]
                    } as any;
                    return;
                }

                // Log subtask completion
                const subtaskModel = context.response?.model;
                const subtaskProvider = context.response?._providerId;
                await logChatTurn(sessionId, {
                    role: 'subtask_response',
                    tool: 'Agentic Subtask',
                    content: `Completed: ${currentTask}`,
                    output: responseContent,
                    contextInjected: subtaskContexts,
                    model: subtaskModel,
                    provider: subtaskProvider
                });

                // Record history of the completed subtask
                const filesModified = getTaskFiles(responseContent);
                if (!q.history) q.history = [];
                q.history.push({
                    task: currentTask,
                    taskId: currentTaskNode.id,
                    output: responseContent,
                    filesModified,
                    timestamp: Date.now(),
                    model: subtaskModel,
                    provider: subtaskProvider
                });

                if (globalRetrospectionCount < 2) {
                    const dataDemand = detectDataDemand(responseContent);
                    if (dataDemand.triggered) {
                        globalRetrospectionCount++;
                        console.error(`[AgenticMiddleware] Data-demand triggered (${globalRetrospectionCount}/2): ${dataDemand.cues.join(', ')}`);
                        
                        const gathered = await ContextGatherer.gatherContext({
                            workspaceRoot: workspaceRoot || process.cwd(),
                            query: dataDemand.cues.join(' ')
                        });

                        if (gathered && gathered.length > 0) {
                            const limited = gathered.slice(0, 5);
                            subtaskContexts.push(`💡 **Data Demand Context**: Injected ${limited.length} lines of matching code/text.\n${excerptForLog(limited.join('\n'))}`);
                            const enrichmentMsg = `[CONTEXT-ENRICHMENT] Here is the gathered context from the workspace:\n\n${limited.join('\n')}`;
                            context.request.messages.push({ role: 'user', content: enrichmentMsg });

                            const newResponse = await this.executor.prompt(context.request.messages, context.request.model, {
                                taskType: context.taskType || 'coding',
                                google_search: context.request.google_search,
                                sessionId,
                                agentic: false
                            });
                            context.response = newResponse;

                            if (newResponse) {
                                 const newResponseContent = getResponseContent({ response: newResponse } as any);
                                 if (newResponseContent) {
                                     const scopeChanged = compareTaskScope(currentTask, newResponseContent);
                                     if (!q.retrospectionInjections) q.retrospectionInjections = 0;
                                     if (scopeChanged && q.retrospectionInjections < 1) {
                                         q.retrospectionInjections++;
                                         console.error(`[AgenticMiddleware] Subtask scope expansion detected. Mutating queue.`);
                                         const newSubtask = `Address expanded scope from retrospection: ${newResponseContent.slice(0, 80)}...`;
                                         q.nowQueue.splice(1, 0, { id: newQueueTaskId(), task: newSubtask });
                                     }
                                 }
                             }
                        }
                    }
                }

                q.nowQueue = q.nowQueue.filter(e => e.id !== currentTaskNode.id);
                await persistState(sessionId, projectDir);

                if (q.nowQueue.length === 0 && context.response && executionPlanBrief) {
                    const resContent = getResponseContent(context);
                    if (resContent) {
                        context.response.choices[0].message.content = executionPlanBrief + resContent;
                    }
                }
            }
        }

        if (q.nowQueue.length === 0) {
            await persistState(sessionId, projectDir);
        }

        if (!context.response) {
            await next();
        }

        // Log final agentic response if the queue is fully processed
        if (context.response && q.nowQueue.length === 0) {
            const finalContent = getResponseContent(context);
            if (finalContent) {
                await logChatTurn(sessionId, {
                    role: 'assistant',
                    tool: 'Agentic Output',
                    content: finalContent,
                    model: context.response?.model,
                    provider: context.response?._providerId
                });
            }
        }
        } finally {
            // Runs on every synchronous exit path (including early returns for
            // CONFUSED/QUESTION/terminal-pause/failed-pause/paused). Only the budget-yield
            // path sets deferredToBackground — there, RunRegistry.finish() is deliberately
            // left to the detached background continuation so isRunning() stays true until
            // it actually drains the queue.
            if (!deferredToBackground) RunRegistry.finish(sessionId);
        }

        } catch (err: any) {
            // Last-resort net for anything outside the subtask-execution loop (e.g.
            // buildExecutionPlan() itself throwing, state I/O failures). Subtask-execution
            // failures specifically (executor.prompt() throwing) are caught one level in,
            // inside executeSingleSubtask(), and turned into a proper paused/`continue <id>`
            // state via the `if (!success || !responseContent)` branch above — they should
            // rarely reach here. This catch still only logs telemetry and rethrows; it does
            // NOT clear q.nowQueue or set q.paused, so anything that does land here still
            // leaves the queue stuck exactly as before — only the loop-level catch above
            // makes that recoverable.
            console.error(`[AgenticMiddleware] Error during execution:`, err);
            try {
                const now = Date.now();
                const isDuplicateError = lastUploadedError &&
                    lastUploadedError.message === err.message &&
                    lastUploadedError.stack === err.stack &&
                    (now - lastUploadedError.timestamp < 10000);

                if (!isDuplicateError) {
                    lastUploadedError = { message: err.message, stack: err.stack, timestamp: now };
                    const { logErrorTelemetry } = await import('../../utils/firebase.js');
                    await logErrorTelemetry('anonymous', err.message || String(err), err.stack || '', promptQueue, commsQueue);
                } else {
                    console.warn(`[AgenticMiddleware] Throttled duplicate error telemetry upload for: ${err.message}`);
                }
            } catch (telemetryErr) {
                console.error(`[AgenticMiddleware] Failed to upload error telemetry:`, telemetryErr);
            }
            throw err;
        }
    }
}
