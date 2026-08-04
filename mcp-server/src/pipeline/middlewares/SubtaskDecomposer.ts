import { LRUCache } from 'lru-cache';
import { promises as fs } from 'fs';
import path from 'path';
import { PROJECTS_DIR, STATE_FILE } from './constants.js';
import { withFileLock } from '../../utils/file-lock.js';
import { writeFileAtomic } from '../../utils/FileUtils.js';
import { debounce } from '../../utils/debounce.js';
import { ContextResolver } from './ContextResolver.js';

export interface SubtaskHistoryEntry {
    task: string;
    taskId?: string;
    output: string;
    filesModified: string[];
    timestamp: number;
    model?: string;
    provider?: string;
}

export interface QueueTask {
    id: string;
    task: string;
    status?: 'pending' | 'running' | 'done' | 'failed';
}

export interface QueueState {
    nowQueue: QueueTask[];
    nextQueue: QueueTask[];
    blockedQueue: QueueTask[];
    improveQueue: QueueTask[];
    resolvedContext?: Record<string, string>;
    history?: SubtaskHistoryEntry[];
    paused?: boolean;
    // Why the queue is paused. 'budget' pauses are yielded automatically when the
    // per-call time budget (SUBTASK_BUDGET_MS) is exceeded and auto-resume on the next
    // call without requiring user input, unlike ordinary terminal/failure pauses which
    // require an explicit `continue <promptId>`.
    pauseReason?: 'budget' | 'terminal' | 'failed';
    promptId?: string;
    pausedSubtaskIndex?: number;
    retrospectionInjections?: number;
}

export function createEmptyQueueState(): QueueState {
    return {
        nowQueue: [],
        nextQueue: [],
        blockedQueue: [],
        improveQueue: [],
        resolvedContext: {},
        history: [],
        paused: false,
        promptId: undefined,
        pausedSubtaskIndex: undefined
    };
}

let queueTaskIdCounter = 0;
export function newQueueTaskId(): string {
    queueTaskIdCounter = (queueTaskIdCounter + 1) % 1_000_000;
    return `t${Date.now().toString(36)}${queueTaskIdCounter.toString(36)}`;
}

const queues = new LRUCache<string, QueueState>({
    max: 500,
    ttl: 1000 * 60 * 60 * 24,
});

export class SubtaskDecomposer {
    static async getOrLoadState(sessionId: string): Promise<QueueState> {
        let state = queues.get(sessionId);
        if (!state) {
            try {
                const statePath = path.join(PROJECTS_DIR, sessionId, STATE_FILE);
                const data = await fs.readFile(statePath, 'utf-8');
                state = JSON.parse(data);
                if (state) queues.set(sessionId, state);
            } catch {}
        }

        if (!state) {
            state = createEmptyQueueState();
            queues.set(sessionId, state);
        } else {
            if (!state.history) state.history = [];
            if (state.paused === undefined) state.paused = false;
            if (!state.resolvedContext) state.resolvedContext = {};

            const migrateQueue = (q: any[]) => {
                if (!Array.isArray(q)) return [];
                return q.map((item, idx) => {
                    if (typeof item === 'string') {
                        return {
                            id: `T${idx + 1}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                            task: item,
                            status: 'pending'
                        };
                    }
                    if (!item.status) item.status = 'pending';
                    return item;
                });
            };
            state.nowQueue = migrateQueue(state.nowQueue);
            state.nextQueue = migrateQueue(state.nextQueue);
            state.blockedQueue = migrateQueue(state.blockedQueue);
            state.improveQueue = migrateQueue(state.improveQueue);
        }
        return state;
    }

    static async persistState(sessionId: string, projectDir: string): Promise<void> {
        const state = queues.get(sessionId);
        if (!state) return;

        const statePath = path.join(projectDir, STATE_FILE);
        try {
            await withFileLock(statePath, async () => {
                await writeFileAtomic(statePath, JSON.stringify(state, null, 2));
            });
        } catch {}
    }

    static persistStateDebounced = debounce(SubtaskDecomposer.persistState, 2000);

    static decomposeGoal(goal: string): { tasks: QueueTask[]; resolvedContext: Record<string, string> } {
        const { tokenized, placeholders } = ContextResolver.protectInjectedReferenceBlocks(goal);
        const steps = placeholders.size === 0 ? SubtaskDecomposer.decomposeGoalCore(goal) : SubtaskDecomposer.decomposeGoalCore(tokenized);
        const tasks = steps.map(task => ({ id: newQueueTaskId(), task }));
        const resolvedContext = Object.fromEntries(placeholders);
        return { tasks, resolvedContext };
    }

    private static decomposeGoalCore(goal: string): string[] {
        let items: string[] = [];
        const lines = goal.split('\n').map(l => l.trim()).filter(Boolean);

        const lineModes = lines.map(line => {
            if (line.startsWith('>')) {
                return { text: line.substring(1).trim(), mode: 'parallel' as const };
            }
            if (line.startsWith('-')) {
                return { text: line.substring(1).trim(), mode: 'sequential' as const };
            }
            const cleanText = line.replace(/^\s*(?:\d+[.)\-]|[-*])\s+/, '').trim();
            return { text: cleanText, mode: undefined };
        });

        const listItems = goal.match(/^\s*(?:\d+[.)\-]|[-*])\s+(.+)/gm);
        const hasExplicitDsl = lines.some(l => l.startsWith('>'));

        if (hasExplicitDsl) {
            items = lineModes.map(m => m.text).filter(Boolean);
        } else if (listItems && listItems.length >= 2) {
            items = listItems.map(l => l.replace(/^\s*(?:\d+[.)\-]|[-*])\s+/, '').trim());
        } else {
            items = goal
                .split(/\n+/)
                .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim())
                .filter(l => l.length > 0);
        }

        if (items.length === 0) {
            return [];
        }

        let finalTasks: { text: string; mode?: 'parallel' | 'sequential' }[] = [];
        if (hasExplicitDsl) {
            finalTasks = lineModes.filter(m => m.text).map(m => ({ text: m.text, mode: m.mode }));
        } else {
            const combined: string[] = [];
            let pendingReads: string[] = [];

            for (const item of items) {
                const isRead = /\b(?:read|view|inspect|show|print|cat|get|display)\b/i.test(item) &&
                               (/(?:[a-zA-Z]:)?[\\/]/i.test(item) || /\b[a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+\b/i.test(item));

                if (isRead) {
                    const fileMatch = item.match(/(?:[a-zA-Z]:)?[\\/][a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+|\b[a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+\b/);
                    if (fileMatch) {
                        pendingReads.push(fileMatch[0]);
                        continue;
                    }
                }

                if (pendingReads.length > 0) {
                    combined.push(`Read and inspect ${pendingReads.join(', ')}`);
                    pendingReads = [];
                }

                combined.push(item);
            }

            if (pendingReads.length > 0) {
                combined.push(`Read and inspect ${pendingReads.join(', ')}`);
            }
            finalTasks = combined.map(t => ({ text: t }));
        }

        const inferTaskType = (t: string): string => {
            const text = t.toLowerCase();
            const codingExts = /\.(ts|js|py|go|rs|json|html|css|sh|yaml|yml)\b/;
            const codingTerms = /\b(fix|bug|refactor|compile|build|implement|feature|code|function|class|variable|merge|git|commit|pr|pull request|issue|lint|syntax|type|interface)\b/;
            const reasoningTerms = /\b(why|explain|reason|prove|analyze|diagnose|debug|verify|logical|math|derivation|theorem|proof)\b/;
            const searchTerms = /\b(search|find|lookup|query|grep|google|fetch|web|internet)\b/;
            const summarizationTerms = /\b(summarize|summary|distill|brief|outline|overview)\b/;

            if (codingExts.test(text) || codingTerms.test(text)) return 'coding';
            if (reasoningTerms.test(text)) return 'reasoning';
            if (searchTerms.test(text)) return 'search';
            if (summarizationTerms.test(text)) return 'summarization';
            return 'chat';
        };

        const parallelTasks = finalTasks.filter(t => t.mode === 'parallel');
        const typeCounts = new Map<string, number>();
        for (const t of parallelTasks) {
            const type = inferTaskType(t.text);
            typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        }

        return finalTasks.map(t => {
            let mode = t.mode;
            if (mode === 'parallel' && (typeCounts.get(inferTaskType(t.text)) || 0) > 1) {
                mode = 'sequential';
            }
            if (mode) {
                return `[${mode}] ${t.text}`;
            }
            return t.text;
        });
    }
}
