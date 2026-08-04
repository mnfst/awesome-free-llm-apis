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

/** Delay (ms) before a finished/aborted entry is evicted from the in-memory Map. */
const RUN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Schedule removal of a completed run after TTL so status polls can still read it briefly. */
function scheduleEviction(sessionId: string): void {
    setTimeout(() => {
        const info = runs.get(sessionId);
        if (info && info.done) {
            runs.delete(sessionId);
        }
    }, RUN_TTL_MS).unref?.(); // .unref() so the timer doesn't block process exit
}

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
        scheduleEviction(sessionId); // fix: prevent unbounded Map growth
    }

    static abort(sessionId: string): boolean {
        const info = runs.get(sessionId);
        if (!info || info.done) return false;
        info.controller.abort();
        info.done = true;
        scheduleEviction(sessionId); // fix: prevent unbounded Map growth
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
