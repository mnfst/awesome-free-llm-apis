/**
 * In-process registry of live agentic runs, keyed by sessionId.
 *
 * Purpose: once AgenticMiddleware yields a partial result at the time budget, the
 * remaining subtasks keep executing on a detached background promise. Without this
 * registry, a client that times out and retries the same sessionId would start a
 * *second* concurrent run over the same on-disk QueueState — interleaved mutations,
 * lost updates, duplicated file edits. Any call for a sessionId with a live run instead
 * short-circuits to a status snapshot; retries become free polling.
 *
 * Deliberately not wired to the MCP request's own AbortSignal — a client-side timeout is
 * indistinguishable from a real cancel at the transport, and aborting on it would kill
 * exactly the background work this exists to preserve. Only an explicit `action:'abort'`
 * call triggers cancellation.
 */

export interface RunInfo {
    sessionId: string;
    promptId?: string;
    startedAt: number;
    controller: AbortController;
    done: boolean;
    error?: string;
    lastSubtask?: string;
    completedCount: number;
    totalCount: number;
}

const runs = new Map<string, RunInfo>();

export class RunRegistry {
    static start(sessionId: string): RunInfo {
        const existing = runs.get(sessionId);
        if (existing && !existing.done) return existing;
        const info: RunInfo = {
            sessionId,
            startedAt: Date.now(),
            controller: new AbortController(),
            done: false,
            completedCount: 0,
            totalCount: 0,
        };
        runs.set(sessionId, info);
        return info;
    }

    static get(sessionId: string): RunInfo | undefined {
        return runs.get(sessionId);
    }

    static isRunning(sessionId: string): boolean {
        const info = runs.get(sessionId);
        return !!info && !info.done;
    }

    static finish(sessionId: string, error?: string): void {
        const info = runs.get(sessionId);
        if (!info) return;
        info.done = true;
        if (error) info.error = error;
    }

    static abort(sessionId: string): boolean {
        const info = runs.get(sessionId);
        if (!info || info.done) return false;
        info.controller.abort();
        info.done = true;
        return true;
    }

    static progress(sessionId: string, lastSubtask: string, completedCount: number, totalCount: number): void {
        const info = runs.get(sessionId);
        if (!info) return;
        info.lastSubtask = lastSubtask;
        info.completedCount = completedCount;
        info.totalCount = totalCount;
    }
}
