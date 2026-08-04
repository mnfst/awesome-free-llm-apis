import crypto from 'node:crypto';
import { NetworkStateTracker } from '../utils/NetworkStateTracker.js';
import { StdioDevToolsClient } from './DevToolsClient.js';
import type { DevToolsClient } from './DevToolsClient.js';
import { evaluateStructured, parseDevToolsResult, withRetry } from './DevToolsCall.js';
import { INTERCEPTOR_INSTALL_SCRIPT, INTERCEPTOR_DRAIN_SCRIPT } from './interceptor.js';
import { detectBlockingChallenge, type BlockingChallengeResult } from './BlockDetector.js';

export type BrowserSessionStatus =
    | 'INITIALIZED' | 'SURFACE_EXPLORED' | 'NODES_DISCOVERED' | 'PLAYER_CARDS_DISCOVERED'
    | 'AWAITING_USER_SELECTION' | 'EXECUTING_SELECTED_OPTION' | 'PAUSED' | 'RESUMED'
    | 'COMPLETED' | 'FAILED';

export interface EngineCaps {
    networkBodiesViaDevTools: boolean | null; // null = not yet probed
    interceptorInstalled: boolean;
    probedAt?: string;
}

export interface CapturedRequest {
    seq: number;
    url: string;
    method: string;
    status: number;
    contentType: string;
    bytes: number;
    body?: string;
    truncated: boolean;
    ts: number;
}

export class DomStateFingerprinter {
    static computeHash(snapshotText: string): string {
        if (!snapshotText) return '';
        const normalized = snapshotText
            .split('\n')
            .map(l => l.trim())
            .filter(l => !l.includes('timestamp') && !l.includes('ms'))
            .join('\n');
        return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    }

    static hasStateChanged(previousHash: string, currentHash: string): boolean {
        if (!previousHash || !currentHash) return true;
        return previousHash !== currentHash;
    }
}

/**
 * Owns one chrome-devtools-mcp client plus per-session browser state:
 * current URL, DOM fingerprint, the network interceptor's read cursor,
 * and the probed capability set for this engine instance.
 */
export class BrowserSession {
    readonly sessionId: string;
    readonly client: DevToolsClient;
    lastUsedAt: number = Date.now();
    currentUrl: string | null = null;
    lastFingerprint: string = '';
    netLogCursor: number = 0;
    engineCaps: EngineCaps = { networkBodiesViaDevTools: null, interceptorInstalled: false };
    networkTracker = new NetworkStateTracker();
    status: BrowserSessionStatus = 'INITIALIZED';
    /** Set by every snapshot() call — a scrape failure downstream can check this to tell
     *  "genuinely empty page" apart from "blocked by Cloudflare/CAPTCHA" before reporting. */
    lastBlockCheck: BlockingChallengeResult = { blocked: false };

    constructor(sessionId: string, client: DevToolsClient) {
        this.sessionId = sessionId;
        this.client = client;
    }

    touch() {
        this.lastUsedAt = Date.now();
    }

    async call(name: string, args: Record<string, any> = {}, opts: { retries?: number } = {}): Promise<any> {
        this.touch();
        return withRetry(() => this.client.callTool({ name, arguments: args }), {
            attempts: opts.retries ?? 3,
        });
    }

    async evaluate<T = any>(fnSource: string, args?: Record<string, any>) {
        this.touch();
        return evaluateStructured<T>(this.client, fnSource, args);
    }

    async navigate(url: string): Promise<void> {
        await this.call('navigate_page', { url });
        this.currentUrl = url;
        // (Re-)install the network interceptor on every navigation — it does not
        // survive a full page load, and SPA route changes are hooked internally
        // via history.pushState/popstate inside the injected script.
        try {
            const res = await this.evaluate(INTERCEPTOR_INSTALL_SCRIPT);
            this.engineCaps.interceptorInstalled = res.ok;
        } catch {
            this.engineCaps.interceptorInstalled = false;
        }
        this.netLogCursor = 0;
    }

    async snapshot(verbose = false): Promise<{ text: string; fingerprint: string }> {
        const raw = await this.call('take_snapshot', { verbose });
        const text = raw?.content?.[0]?.text || '';
        const fingerprint = DomStateFingerprinter.computeHash(text);
        this.lastFingerprint = fingerprint;
        this.lastBlockCheck = detectBlockingChallenge(text);
        return { text, fingerprint };
    }

    /**
     * Drains newly captured network requests from the in-page interceptor ring
     * buffer since the last drain. This is the tier that catches traffic fired
     * AFTER navigate (tab clicks etc) — the case that mattered for SofaScore,
     * since list_network_requests alone only gives markdown-formatted URLs.
     */
    async drainInterceptedRequests(): Promise<CapturedRequest[]> {
        const res = await this.evaluate<{ entries: CapturedRequest[]; cursor: number }>(
            INTERCEPTOR_DRAIN_SCRIPT,
            { since: this.netLogCursor }
        );
        if (!res.ok || !res.json) return [];
        this.netLogCursor = res.json.cursor ?? this.netLogCursor;
        return res.json.entries ?? [];
    }

    /**
     * Probes whether chrome-devtools-mcp's network tooling returns response BODIES
     * (not just URLs/status). Must be established at runtime, not assumed — cached
     * on this session (and intended to be cached in site memory across sessions).
     */
    async probeBodyCapture(): Promise<boolean> {
        if (this.engineCaps.networkBodiesViaDevTools !== null) {
            return this.engineCaps.networkBodiesViaDevTools;
        }
        try {
            const listRes = await this.call('list_network_requests', { resourceTypes: ['fetch', 'xhr'], pageSize: 5 });
            const parsed = parseDevToolsResult(listRes);
            const hasBody = /"body"|"responseBody"|content-length/i.test(parsed.text) && parsed.text.length > 200;
            this.engineCaps.networkBodiesViaDevTools = hasBody;
        } catch {
            this.engineCaps.networkBodiesViaDevTools = false;
        }
        this.engineCaps.probedAt = new Date().toISOString();
        return this.engineCaps.networkBodiesViaDevTools;
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}

export async function createRealBrowserSession(sessionId: string, opts: { userDataDir?: string; connectTimeoutMs?: number } = {}): Promise<BrowserSession> {
    const client = await StdioDevToolsClient.connect(opts);
    return new BrowserSession(sessionId, client);
}
