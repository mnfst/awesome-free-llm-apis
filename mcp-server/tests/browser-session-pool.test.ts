import { describe, it, expect, vi } from 'vitest';
import { BrowserSessionPool } from '../src/browser/BrowserSessionPool.js';
import { BrowserSession } from '../src/browser/BrowserSession.js';
import { FakeDevToolsClient } from '../src/browser/DevToolsClient.js';

describe('BrowserSession.snapshot block detection', () => {
    it('flags lastBlockCheck when the snapshot text contains a Cloudflare marker', async () => {
        const client = new FakeDevToolsClient(() => ({ content: [{ type: 'text', text: 'heading "Just a moment..." text "Checking your browser before accessing"' }] }));
        const session = new BrowserSession('s1', client);
        expect(session.lastBlockCheck.blocked).toBe(false);
        await session.snapshot(false);
        expect(session.lastBlockCheck.blocked).toBe(true);
        expect(session.lastBlockCheck.type).toBe('cloudflare');
    });

    it('leaves lastBlockCheck unset for ordinary content', async () => {
        const client = new FakeDevToolsClient(() => ({ content: [{ type: 'text', text: 'heading "Match Details" link "Player A"' }] }));
        const session = new BrowserSession('s2', client);
        await session.snapshot(false);
        expect(session.lastBlockCheck.blocked).toBe(false);
    });
});

function makeSession(id: string) {
    return new BrowserSession(id, new FakeDevToolsClient());
}

describe('BrowserSessionPool', () => {
    it('reuses a session by sessionId instead of creating a new one', async () => {
        const factory = vi.fn(async (id: string) => makeSession(id));
        const pool = new BrowserSessionPool(factory);

        const first = await pool.acquire('s1');
        const second = await pool.acquire('s1');

        expect(first.session).toBe(second.session);
        expect(factory).toHaveBeenCalledTimes(1);
        await pool.shutdownAll();
    });

    it('evicts the LRU session and pauses it (via onEvict) before closing when at capacity', async () => {
        process.env.BROWSER_MAX_SESSIONS = '2';
        const pool = new BrowserSessionPool(async (id) => makeSession(id));
        const evicted: string[] = [];
        pool.setOnEvict(async (s) => { evicted.push(s.sessionId); });

        const a = await pool.acquire('a');
        await new Promise(r => setTimeout(r, 5));
        const b = await pool.acquire('b');
        await new Promise(r => setTimeout(r, 5));
        // 'a' is now the least-recently-used; acquiring a third session must evict it.
        const c = await pool.acquire('c');

        expect(evicted).toContain('a');
        expect(a.session?.client).toBeInstanceOf(FakeDevToolsClient);
        expect((a.session!.client as FakeDevToolsClient).closed).toBe(true);
        expect(c.session).toBeTruthy();

        await pool.shutdownAll();
        delete process.env.BROWSER_MAX_SESSIONS;
    });

    it('never throws when the engine fails to start — returns a structured error', async () => {
        const pool = new BrowserSessionPool(async () => { throw new Error('npx not found'); });
        const result = await pool.acquire('doomed');
        expect(result.session).toBeNull();
        expect(result.error).toContain('npx not found');
        await pool.shutdownAll();
    });

    it('caches a failure for a short window instead of re-paying the spawn cost on every call', async () => {
        const factory = vi.fn(async () => { throw new Error('boom'); });
        const pool = new BrowserSessionPool(factory);

        await pool.acquire('x');
        await pool.acquire('x');
        expect(factory).toHaveBeenCalledTimes(1);
        await pool.shutdownAll();
    });
});
