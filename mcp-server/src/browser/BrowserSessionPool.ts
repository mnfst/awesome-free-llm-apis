import { BrowserSession, createRealBrowserSession } from './BrowserSession.js';
import type { DevToolsClient } from './DevToolsClient.js';

const MAX_SESSIONS = envInt('BROWSER_MAX_SESSIONS', 2);
const IDLE_TIMEOUT_MS = envInt('BROWSER_IDLE_TIMEOUT_MS', 300_000);
const FAILURE_CACHE_MS = 60_000;

function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type SessionFactory = (sessionId: string) => Promise<BrowserSession>;

/**
 * Process-wide singleton pool of live browser sessions, keyed by sessionId.
 * A browser is NOT shareable across processes — the stdio MCP server and the
 * HTTP server (src/server.ts) are typically separate processes, each with
 * their own pool instance. The on-disk checkpoint remains the only
 * cross-process handoff (see ScrapingSessionCheckpointManager).
 */
export class BrowserSessionPool {
    private sessions = new Map<string, BrowserSession>();
    private lastFailureAt = new Map<string, number>();
    private lastFailureMsg = new Map<string, string>();
    private reaper: ReturnType<typeof setInterval> | null = null;
    private onEvict?: (session: BrowserSession) => Promise<void>;

    constructor(private factory: SessionFactory = (id) => createRealBrowserSession(id)) {
        this.reaper = setInterval(() => this.reapIdle().catch(() => {}), Math.min(IDLE_TIMEOUT_MS, 60_000));
        this.reaper.unref?.();
    }

    /** Called before a session is closed due to eviction/idle-reap, so callers can persist a PAUSED checkpoint. */
    setOnEvict(cb: (session: BrowserSession) => Promise<void>) {
        this.onEvict = cb;
    }

    async acquire(sessionId: string): Promise<{ session: BrowserSession | null; error?: string }> {
        const existing = this.sessions.get(sessionId);
        if (existing) {
            existing.touch();
            return { session: existing };
        }

        const lastFail = this.lastFailureAt.get(sessionId);
        if (lastFail && Date.now() - lastFail < FAILURE_CACHE_MS) {
            return { session: null, error: this.lastFailureMsg.get(sessionId) || 'Browser engine unavailable (cached failure)' };
        }

        if (this.sessions.size >= MAX_SESSIONS) {
            await this.evictLru();
        }

        try {
            const session = await this.factory(sessionId);
            this.sessions.set(sessionId, session);
            this.lastFailureAt.delete(sessionId);
            return { session };
        } catch (err: any) {
            const msg = `Failed to start browser engine: ${err?.message || err}. Install Node >= 20 and ensure "npx -y chrome-devtools-mcp" can run; set CHROME_PATH if Chrome is not auto-discovered.`;
            this.lastFailureAt.set(sessionId, Date.now());
            this.lastFailureMsg.set(sessionId, msg);
            return { session: null, error: msg };
        }
    }

    async release(sessionId: string, close = false): Promise<void> {
        if (!close) return;
        const session = this.sessions.get(sessionId);
        if (!session) return;
        this.sessions.delete(sessionId);
        await this.closeWithEvictHook(session);
    }

    private async evictLru(): Promise<void> {
        let oldest: BrowserSession | null = null;
        for (const s of this.sessions.values()) {
            if (!oldest || s.lastUsedAt < oldest.lastUsedAt) oldest = s;
        }
        if (!oldest) return;
        this.sessions.delete(oldest.sessionId);
        await this.closeWithEvictHook(oldest);
    }

    private async reapIdle(): Promise<void> {
        const now = Date.now();
        for (const [id, session] of Array.from(this.sessions.entries())) {
            if (now - session.lastUsedAt > IDLE_TIMEOUT_MS) {
                this.sessions.delete(id);
                await this.closeWithEvictHook(session);
            }
        }
    }

    private async closeWithEvictHook(session: BrowserSession): Promise<void> {
        try {
            if (this.onEvict) await this.onEvict(session);
        } catch {
            // checkpoint-on-evict must never block teardown
        }
        try {
            await session.close();
        } catch {
            // best-effort
        }
    }

    async shutdownAll(): Promise<void> {
        if (this.reaper) clearInterval(this.reaper);
        const sessions = Array.from(this.sessions.values());
        this.sessions.clear();
        await Promise.all(sessions.map(s => this.closeWithEvictHook(s)));
    }

    size(): number {
        return this.sessions.size;
    }
}

let sharedPool: BrowserSessionPool | null = null;

export function getBrowserSessionPool(): BrowserSessionPool {
    if (!sharedPool) {
        sharedPool = new BrowserSessionPool();
    }
    return sharedPool;
}

/** Test/DI hook — replace the shared pool with a custom instance (e.g. backed by FakeDevToolsClient). */
export function setBrowserSessionPoolForTesting(pool: BrowserSessionPool | null): void {
    sharedPool = pool;
}
