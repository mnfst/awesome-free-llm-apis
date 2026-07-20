import { promises as fs } from 'fs';
import path from 'path';
import { RepositoryGraph } from '../../memory/dependency-scanner.js';

export type ExecutionLane = 'sequential' | 'parallel';

// Structurally compatible with AgenticMiddleware.ts's QueueTask — defined locally to avoid a
// circular import (AgenticMiddleware.ts imports buildExecutionPlan from this file).
export interface TaskInput {
    id: string;
    task: string;
}

export interface ClassifiedTask {
    id: string;
    task: string;
    lane: ExecutionLane;
    slot: 1 | 2 | 3;
    dependsOn?: string[];
}

export interface ExecutionPlan {
    userBrief: string;
    phase1: ClassifiedTask[];
    phase2?: ClassifiedTask[];
}

/**
 * Extracts referenced files from a task string.
 */
function extractFiles(task: string): string[] {
    const filePattern = /\b[a-zA-Z0-9_\-\/\\.]+\.(ts|js|py|go|rs|md|json)\b/g;
    const matches = task.match(filePattern) || [];
    return matches.map(f => f.replace(/\\/g, '/').toLowerCase());
}

/**
 * Builds an execution plan for a set of subtasks using the repository dependency graph.
 */
export async function buildExecutionPlan(
    tasks: TaskInput[],
    workspaceRoot: string
): Promise<ExecutionPlan> {
    const mcpDir = path.join(workspaceRoot, '.free-llm-mcp');
    const graphPath = path.join(mcpDir, 'repo_graph.json');

    let graph: RepositoryGraph | null = null;
    try {
        const graphData = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
        graph = RepositoryGraph.deserialize(workspaceRoot, graphData);
    } catch {
        // Fallback: graph is empty/null if file doesn't exist
    }

    // Limit to max 3 subtasks as per constraints
    const rawActiveTasks = tasks.slice(0, 3);
    if (rawActiveTasks.length === 0) {
        return {
            userBrief: 'No tasks to plan.',
            phase1: []
        };
    }

    // Parse user-specified modes from task prefixes
    const parsedTasks = rawActiveTasks.map(t => {
        if (t.task.startsWith('[parallel] ')) {
            return { id: t.id, raw: t.task, task: t.task.substring(11), userHint: 'parallel' as const };
        }
        if (t.task.startsWith('[sequential] ')) {
            return { id: t.id, raw: t.task, task: t.task.substring(13), userHint: 'sequential' as const };
        }
        return { id: t.id, raw: t.task, task: t.task, userHint: undefined };
    });

    const activeTasks = parsedTasks.map(p => p.task);
    // Builds a ClassifiedTask carrying the originating id, so overrideLanes and any
    // downstream id-based correlation (history, dequeue) work correctly even if two
    // subtasks happen to have identical task text.
    const mk = (idx: number, lane: ExecutionLane, slot: 1 | 2 | 3, dependsOn?: string[]): ClassifiedTask => ({
        id: parsedTasks[idx].id,
        task: activeTasks[idx],
        lane,
        slot,
        ...(dependsOn ? { dependsOn } : {})
    });

    // Extract files referenced by each task
    const taskFiles = activeTasks.map(t => extractFiles(t));

    // Determine dependencies between tasks.
    const hasDependency = (idxA: number, idxB: number): boolean => {
        // If user explicitly marked either as sequential/parallel, that overrides heuristics
        const hintA = parsedTasks[idxA].userHint;
        const hintB = parsedTasks[idxB].userHint;
        if (hintA === 'parallel' && hintB === 'parallel') return false;
        if (hintA === 'sequential' || hintB === 'sequential') return true;

        if (idxA >= idxB) return false;

        const taskA = activeTasks[idxA].toLowerCase();
        const taskB = activeTasks[idxB].toLowerCase();

        // Rule 1: Textual cues
        if (taskB.includes(`step ${idxA + 1}`) || taskB.includes(`task ${idxA + 1}`)) return true;
        if (taskB.includes('then') || taskB.includes('after that') || taskB.includes('subsequent')) return true;

        if (graph) {
            const filesA = taskFiles[idxA];
            const filesB = taskFiles[idxB];

            for (const fileB of filesB) {
                for (const fileA of filesA) {
                    const nodesA = graph.getAllNodes().filter(n => n.id.toLowerCase().endsWith(fileA));
                    const nodesB = graph.getAllNodes().filter(n => n.id.toLowerCase().endsWith(fileB));

                    for (const nodeA of nodesA) {
                        for (const nodeB of nodesB) {
                            const edgesFromA = graph.getEdgesFrom(nodeA.id);
                            if (edgesFromA.some(e => e.target === nodeB.id)) return true;

                            const edgesFromB = graph.getEdgesFrom(nodeB.id);
                            if (edgesFromB.some(e => e.target === nodeA.id)) return true;
                        }
                    }
                }
            }
        }

        return false;
    };

    const phase1: ClassifiedTask[] = [];
    const phase2: ClassifiedTask[] = [];

    if (activeTasks.length === 1) {
        phase1.push(mk(0, parsedTasks[0].userHint || 'sequential', 1));
    } else if (activeTasks.length === 2) {
        const dep1_2 = hasDependency(0, 1);
        if (dep1_2) {
            phase1.push(mk(0, parsedTasks[0].userHint || 'sequential', 1));
            phase2.push(mk(1, parsedTasks[1].userHint || 'sequential', 2, [activeTasks[0]]));
        } else {
            // Independent, run in parallel in Phase 1
            phase1.push(
                mk(0, parsedTasks[0].userHint || 'parallel', 1),
                mk(1, parsedTasks[1].userHint || 'parallel', 2)
            );
        }
    } else { // Exactly 3 tasks
        const dep1_2 = hasDependency(0, 1);
        const dep2_3 = hasDependency(1, 2);
        const dep1_3 = hasDependency(0, 2);

        if (dep1_2 && dep2_3) {
            // Fully sequential: T1 -> T2 -> T3
            phase1.push(mk(0, 'sequential', 1));
            phase2.push(mk(1, 'sequential', 2, [activeTasks[0]]));
            // We can add T3 to a third phase or put it sequentially in phase2 (drained after T2)
            // For simplicity, let's keep phase1 vs phase2.
            // We can place T3 in phase2 as sequential with dependsOn T2
            phase2.push(mk(2, 'sequential', 3, [activeTasks[1]]));
        } else if (dep1_2 && !dep2_3 && !dep1_3) {
            // T1 -> T2, T3 is independent.
            // Run T1 and T3 in parallel in Phase 1, T2 in Phase 2
            phase1.push(
                mk(0, 'parallel', 1),
                mk(2, 'parallel', 2)
            );
            phase2.push(mk(1, 'sequential', 3, [activeTasks[0]]));
        } else if (dep1_2 && !dep2_3 && dep1_3) {
            // T1 -> T2, T1 -> T3, T2 ⊥ T3.
            // Run T1 in Phase 1, T2 and T3 in parallel in Phase 2
            phase1.push(mk(0, 'sequential', 1));
            phase2.push(
                mk(1, 'parallel', 2, [activeTasks[0]]),
                mk(2, 'parallel', 3, [activeTasks[0]])
            );
        } else if (!dep1_2 && dep2_3 && !dep1_3) {
            // T2 -> T3, T1 is independent.
            // Run T1 and T2 in parallel in Phase 1, T3 in Phase 2
            phase1.push(
                mk(0, 'parallel', 1),
                mk(1, 'parallel', 2)
            );
            phase2.push(mk(2, 'sequential', 3, [activeTasks[1]]));
        } else if (!dep1_2 && !dep2_3 && dep1_3) {
            // T1 -> T3, T2 is independent.
            // Run T1 and T2 in parallel in Phase 1, T3 in Phase 2
            phase1.push(
                mk(0, 'parallel', 1),
                mk(1, 'parallel', 2)
            );
            phase2.push(mk(2, 'sequential', 3, [activeTasks[0]]));
        } else {
            // Fully independent! Run T1 & T2 in parallel in Phase 1, T3 sequentially in Phase 2 (due to max 2 parallel limit)
            phase1.push(
                mk(0, 'parallel', 1),
                mk(1, 'parallel', 2)
            );
            phase2.push(mk(2, 'sequential', 3));
        }
    }

    // Override lanes based on user-specified hints
    const overrideLanes = (list: ClassifiedTask[]) => {
        list.forEach(t => {
            const parsed = parsedTasks.find(p => p.id === t.id);
            if (parsed && parsed.userHint) {
                t.lane = parsed.userHint;
            }
        });
    };
    overrideLanes(phase1);
    overrideLanes(phase2);

    // Build the user brief plan description
    const planBriefLines = ['🔍 Task Plan:'];
    planBriefLines.push('  Phase 1:');
    phase1.forEach(t => planBriefLines.push(`    - [${t.lane}] Slot ${t.slot}: ${t.task}`));
    if (phase2.length > 0) {
        planBriefLines.push('  Phase 2:');
        phase2.forEach(t => {
            const deps = t.dependsOn ? ` (depends on: ${t.dependsOn.map(d => d.slice(0, 20) + '...').join(', ')})` : '';
            planBriefLines.push(`    - [${t.lane}] Slot ${t.slot}: ${t.task}${deps}`);
        });
    }

    return {
        userBrief: planBriefLines.join('\n'),
        phase1,
        phase2: phase2.length > 0 ? phase2 : undefined
    };
}
