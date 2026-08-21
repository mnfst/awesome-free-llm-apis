import path from 'node:path';
import { parseInput, type BrowserToolInput } from './actionSchemas.js';
import { getBrowserSessionPool } from './BrowserSessionPool.js';
import type { BrowserSession } from './BrowserSession.js';
import { DomStateFingerprinter } from './BrowserSession.js';
import { parseSnapshot, diffSnapshots, summarizeDiff, looksLikeStructuralInterstitial } from './SnapshotDiffer.js';
import { evaluateStructured } from './DevToolsCall.js';
import { EndpointRanker } from './EndpointRanker.js';
import { EndpointTemplater } from './EndpointTemplater.js';
import { UniversalTabularSchemaFlattener } from '../utils/UniversalTabularSchemaFlattener.js';
import { ScraperExporter } from '../utils/ScraperExporter.js';
import { browserBudget, fitToTokenBudget } from './BudgetPolicy.js';
import { ContextSanitizer } from '../utils/NetworkStateTracker.js';
import {
    type BrowserActionResult, type BrowserToolError, okResult, failResult, engineUnavailableError,
} from './types.js';
import {
    ScrapingSessionCheckpointManager, IntelligentBrowserScraper, type ScrapingSessionCheckpoint,
} from '../tools/browser-action.js';

/**
 * Fire-and-forget: reports a detected Cloudflare/CAPTCHA block to Firestore so
 * these show up as a distinct, filterable failure class instead of looking
 * like an ordinary "0 records extracted" result. Never awaited by callers on
 * the critical path — logScrapingFailure already swallows its own errors.
 */
function reportBlockIfDetected(session: BrowserSession, action: string, sessionId: string): void {
    if (!session.lastBlockCheck.blocked) return;
    import('../utils/firebase.js').then(({ logScrapingFailure }) =>
        logScrapingFailure('anonymous', {
            url: session.currentUrl || undefined,
            sessionId,
            action,
            failureType: session.lastBlockCheck.type || 'unknown',
            evidence: session.lastBlockCheck.evidence,
        })
    ).catch(() => {});
}

function defaultOutputDir(input: BrowserToolInput): string {
    return input.outputDir || path.join(process.cwd(), 'data', 'scrapes');
}

function sessionIdOf(input: BrowserToolInput): string {
    return input.sessionId || `session_${(input.url || 'browser').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)}`;
}

async function loadOrInitCheckpoint(outputDir: string, sessionId: string, url?: string): Promise<ScrapingSessionCheckpoint> {
    const existing = await ScrapingSessionCheckpointManager.loadCheckpoint(outputDir, sessionId);
    if (existing) return existing;
    return {
        sessionId,
        targetUrl: url || '',
        domainContext: 'Web Page Data',
        status: 'INITIALIZED',
        currentPage: 1,
        visitedUrls: url ? [url] : [],
        pendingUrlQueue: [],
        domStateFingerprint: '',
        accumulatedRecords: [],
        deepRecords: [],
        discoveredNodes: [],
        discoveredSections: [],
        lastUpdated: new Date().toISOString(),
    };
}

const LEGACY_FLAT_KEYS = ['domainContext', 'filenameBase', 'continueFromState', 'forceRegenerateScript', 'deepScrapeLimit', 'op'];

/**
 * Back-compat shim: the pre-2.0 schema only had `action: 'scrape'|'list_checkpoints'`
 * with everything else (domainContext, filenameBase, deepScrapeLimit, ...) as flat
 * top-level properties. The new schema nests action-specific fields under `params`.
 * Callers sending the old shape get remapped transparently instead of silently
 * losing fields (zod would otherwise strip unknown top-level keys).
 */
function normalizeLegacyInput(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw;
    const out = { ...raw };

    if (out.url === 'list_checkpoints' || out.action === 'list_checkpoints') {
        out.action = 'checkpoint';
        out.params = { ...(out.params || {}), op: 'list' };
        return out;
    }

    if (out.action === 'scrape') {
        const flatParams: Record<string, any> = { ...(out.params || {}) };
        for (const key of LEGACY_FLAT_KEYS) {
            if (out[key] !== undefined) flatParams[key] = out[key];
        }
        // scrapeAndProcessWithCheckpoint's BrowserScrapeInput also reads url/sessionId/outputDir/userInstructions directly.
        out.params = { url: out.url, sessionId: out.sessionId, outputDir: out.outputDir, userInstructions: out.userInstructions, ...flatParams };
    }

    return out;
}

/**
 * Main entry point for the new action surface. Acquires (or reuses) a real
 * chrome-devtools-mcp session from the process-wide pool and routes to a
 * per-action handler. Never throws — engine failures come back as a
 * structured BrowserActionResult so a plain MCP client always gets JSON.
 */
export async function dispatchBrowserAction(rawInput: unknown): Promise<BrowserActionResult> {
    let input: BrowserToolInput;
    try {
        input = parseInput(normalizeLegacyInput(rawInput));
    } catch (err: any) {
        return failResult({
            action: (rawInput as any)?.action || 'unknown',
            sessionId: (rawInput as any)?.sessionId || 'unknown',
            errors: [{ stage: 'input', code: 'INVALID_INPUT', message: err?.message || String(err), recoverable: true }],
        });
    }

    const sessionId = sessionIdOf(input);

    // checkpoint/list_checkpoints and site_memory don't need a live browser.
    if (input.action === 'checkpoint' && input.params?.op === 'list') {
        const outputDir = defaultOutputDir(input);
        const checkpoints = await ScrapingSessionCheckpointManager.listCheckpoints(outputDir);
        return okResult({ action: 'checkpoint', sessionId, data: checkpoints as any, recordCount: checkpoints.length });
    }

    // The legacy 'scrape' macro without an explicit action still goes through
    // IntelligentBrowserScraper for full back-compat with existing callers/tests.
    if (input.action === 'scrape') {
        const scraper = new IntelligentBrowserScraper();
        const pool = getBrowserSessionPool();
        const acquired = await pool.acquire(sessionId);
        if (!acquired.session) {
            const legacy = await scraper.scrapeAndProcessWithCheckpoint(input.params as any, null);
            return failResult({ action: 'scrape', sessionId, errors: [engineUnavailableError(acquired.error || 'unknown')], data: legacy as any });
        }
        return runScrapeMacro(acquired.session, input, sessionId);
    }

    const pool = getBrowserSessionPool();
    const acquired = await pool.acquire(sessionId);
    if (!acquired.session) {
        return failResult({ action: input.action, sessionId, errors: [engineUnavailableError(acquired.error || 'unknown')] });
    }
    const session = acquired.session;

    try {
        switch (input.action) {
            case 'navigate': return await handleNavigate(session, input, sessionId);
            case 'snapshot': return await handleSnapshot(session, input, sessionId);
            case 'click': return await handleClick(session, input, sessionId);
            case 'scroll': return await handleScroll(session, input, sessionId);
            case 'wait': return await handleWait(session, input, sessionId);
            case 'evaluate': return await handleEvaluate(session, input, sessionId);
            case 'network': return await handleNetwork(session, input, sessionId);
            case 'api_replay': return await handleApiReplay(session, input, sessionId);
            case 'extract': return await handleExtract(session, input, sessionId);
            case 'checkpoint': return await handleCheckpoint(session, input, sessionId);
            case 'session': return await handleSession(session, input, sessionId, pool);
            case 'screenshot': return await handleScreenshot(session, input, sessionId);
            case 'deep_scrape': return await handleDeepScrape(session, input, sessionId);
            default:
                return failResult({ action: input.action, sessionId, errors: [{ stage: 'dispatch', code: 'UNSUPPORTED_ACTION', message: `Action '${input.action}' is not yet implemented`, recoverable: false }] });
        }
    } catch (err: any) {
        return failResult({ action: input.action, sessionId, errors: [{ stage: input.action, code: 'ACTION_THREW', message: err?.message || String(err), recoverable: true }] });
    }
}

async function handleNavigate(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    if (!input.url) {
        return failResult({ action: 'navigate', sessionId, errors: [{ stage: 'navigate', code: 'MISSING_URL', message: 'navigate requires url', recoverable: true }] });
    }
    await session.navigate(input.url);
    session.status = 'SURFACE_EXPLORED';
    return okResult({ action: 'navigate', sessionId, url: input.url, data: { navigated: true } });
}

async function handleSnapshot(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { text, fingerprint } = await session.snapshot(!!input.params?.verbose);
    const trimmed = fitToTokenBudget(text, browserBudget.snapshotTokens);
    const blocked = session.lastBlockCheck.blocked;
    if (blocked) reportBlockIfDetected(session, 'snapshot', sessionId);
    return okResult({
        action: 'snapshot', sessionId, url: session.currentUrl || undefined,
        data: { snapshot: trimmed, fingerprint },
        warnings: blocked ? [`BLOCKED_BY_${(session.lastBlockCheck.type || 'unknown').toUpperCase()}`] : [],
    });
}

async function handleClick(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { by, value, scrollIntoView = true } = input.params as any;
    const before = session.lastFingerprint;
    const beforeText = session.lastSnapshotText;

    const res = await session.evaluate<{ matched: boolean; label?: string }>(`(args) => {
        const nodes = Array.from(document.querySelectorAll('a, button, div[role="button"], div[role="tab"], div[onclick], [data-id]'));
        function labelOf(el) { return (el.innerText || el.textContent || '').trim(); }
        let target = null;
        if (args.by === 'selector') {
            target = document.querySelector(args.value);
        } else if (args.by === 'uid') {
            target = nodes[parseInt(args.value, 10) - 1] || null;
        } else if (args.by === 'role') {
            target = nodes.find(n => (n.getAttribute('role') || n.tagName.toLowerCase()) === args.value) || null;
        } else {
            // label / text: rank exact > startsWith > includes
            const exact = nodes.find(n => labelOf(n) === args.value);
            const starts = nodes.find(n => labelOf(n).startsWith(args.value));
            const inc = nodes.find(n => labelOf(n).includes(args.value));
            target = exact || starts || inc || null;
        }
        if (!target) return { matched: false };
        if (args.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.click();
        return { matched: true, label: labelOf(target).slice(0, 60) };
    }`, { by, value, scrollIntoView });

    if (!res.ok || !res.json?.matched) {
        // The click failing on something that looks like a verification button
        // ("Verify you are human", a Cloudflare Turnstile widget, etc) is worth
        // telling apart from an ordinary missing element — take a fresh snapshot
        // to check, since the last one may predate this click attempt.
        await session.snapshot(false);
        if (session.lastBlockCheck.blocked) {
            reportBlockIfDetected(session, 'click', sessionId);
            return failResult({
                action: 'click', sessionId,
                errors: [{
                    stage: 'click', code: `BLOCKED_BY_${(session.lastBlockCheck.type || 'unknown').toUpperCase()}`,
                    message: `Could not click "${value}" — page is a ${session.lastBlockCheck.type || 'unknown'} challenge wall (matched "${session.lastBlockCheck.evidence}")`,
                    recoverable: true,
                }],
            });
        }
        return failResult({
            action: 'click', sessionId,
            errors: [{ stage: 'click', code: 'ELEMENT_NOT_FOUND', message: res.error || `No element matched ${by}=${value}`, recoverable: true }],
        });
    }

    const after = await session.snapshot(false);
    const changed = DomStateFingerprinter.hasStateChanged(before, after.fingerprint);
    const hasBaseline = Boolean(before && beforeText);
    const warnings = changed ? [] : ['CLICK_NO_EFFECT'];
    if (!hasBaseline) warnings.push('BASELINE_SNAPSHOT_UNAVAILABLE');

    let domDiffSummary: string | undefined;
    if (changed && hasBaseline) {
        const beforeNodes = parseSnapshot(beforeText);
        const diff = diffSnapshots(beforeNodes, parseSnapshot(after.text));
        domDiffSummary = summarizeDiff(diff);
        session.applyStructuralSignal(looksLikeStructuralInterstitial(beforeNodes, diff));
    } else if (changed) {
        domDiffSummary = 'No prior snapshot baseline; captured current snapshot without structural diff.';
    }

    return okResult({ action: 'click', sessionId, data: { clicked: res.json.label, domChanged: changed, domDiffSummary }, warnings });
}

async function handleScroll(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { target, selectorOrLabel, to } = input.params as any;

    const res = await session.evaluate<{ scrolled: boolean; containerDescriptor?: string }>(`(args) => {
        function labelOf(el) { return (el.innerText || el.textContent || '').trim(); }
        if (args.target === 'window') {
            const y = args.to === 'bottom' ? document.body.scrollHeight : (typeof args.to === 'number' ? args.to : 0);
            window.scrollTo(0, y);
            return { scrolled: true, containerDescriptor: 'window' };
        }
        const nodes = Array.from(document.querySelectorAll('a, button, div, span'));
        const match = args.selectorOrLabel ? (document.querySelector(args.selectorOrLabel) || nodes.find(n => labelOf(n).includes(args.selectorOrLabel))) : null;
        if (!match) return { scrolled: false };
        if (args.target === 'element') {
            match.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { scrolled: true, containerDescriptor: 'matched element' };
        }
        // container: walk up from the matched element to the nearest scrollable ancestor
        let el = match;
        let container = null;
        while (el && el !== document.body) {
            if (el.scrollHeight > el.clientHeight + 4) { container = el; break; }
            el = el.parentElement;
        }
        if (!container) return { scrolled: false, containerDescriptor: 'no scrollable ancestor found' };
        container.scrollTop = args.to === 'bottom' ? container.scrollHeight : (typeof args.to === 'number' ? args.to : container.scrollTop + 400);
        const desc = (container.tagName || '').toLowerCase() + (container.className ? '.' + String(container.className).split(' ')[0] : '');
        return { scrolled: true, containerDescriptor: desc };
    }`, { target, selectorOrLabel, to });

    if (!res.ok || !res.json?.scrolled) {
        return failResult({
            action: 'scroll', sessionId,
            errors: [{ stage: 'scroll', code: 'SCROLL_TARGET_NOT_FOUND', message: res.json?.containerDescriptor || res.error || 'No scrollable target resolved', recoverable: true }],
        });
    }
    return okResult({ action: 'scroll', sessionId, data: res.json });
}

async function handleWait(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { until, value, timeoutMs = 8000, pollMs = 300 } = input.params as any;
    const deadline = Date.now() + timeoutMs;

    if (until === 'timeout') {
        await new Promise(r => setTimeout(r, timeoutMs));
        return okResult({ action: 'wait', sessionId, data: { waited: timeoutMs } });
    }

    if (until === 'dom-stable' || until === 'selector' || until === 'text') {
        const beforeWaitText = session.lastSnapshotText;
        const hasBaseline = Boolean(session.lastFingerprint && beforeWaitText);
        let lastFp = session.lastFingerprint;
        while (Date.now() < deadline) {
            const { text, fingerprint } = await session.snapshot(false);
            if (until === 'dom-stable' && !DomStateFingerprinter.hasStateChanged(lastFp, fingerprint)) {
                if (!hasBaseline) {
                    return okResult({
                        action: 'wait',
                        sessionId,
                        data: {
                            stable: true,
                            domDiffSummary: 'No prior snapshot baseline; DOM is stable but structural diff was not computed.',
                        },
                        warnings: ['BASELINE_SNAPSHOT_UNAVAILABLE'],
                    });
                }
                const beforeWaitNodes = parseSnapshot(beforeWaitText);
                const diff = diffSnapshots(beforeWaitNodes, parseSnapshot(text));
                session.applyStructuralSignal(looksLikeStructuralInterstitial(beforeWaitNodes, diff));
                return okResult({ action: 'wait', sessionId, data: { stable: true, domDiffSummary: summarizeDiff(diff) } });
            }
            if (until === 'selector' && value) {
                const found = await session.evaluate<boolean>(`(a) => !!document.querySelector(a.value)`, { value });
                if (found.ok && found.json) return okResult({ action: 'wait', sessionId, data: { found: true } });
            }
            if (until === 'text' && value && text.includes(value)) {
                return okResult({ action: 'wait', sessionId, data: { found: true } });
            }
            lastFp = fingerprint;
            await new Promise(r => setTimeout(r, pollMs));
        }
        return failResult({ action: 'wait', sessionId, errors: [{ stage: 'wait', code: 'WAIT_TIMEOUT', message: `Condition '${until}' not met within ${timeoutMs}ms`, recoverable: true }] });
    }

    if (until === 'network-idle') {
        let lastCursor = session.netLogCursor;
        let idleSince = Date.now();
        while (Date.now() < deadline) {
            await session.drainInterceptedRequests();
            if (session.netLogCursor === lastCursor) {
                if (Date.now() - idleSince > pollMs * 2) return okResult({ action: 'wait', sessionId, data: { idle: true } });
            } else {
                idleSince = Date.now();
                lastCursor = session.netLogCursor;
            }
            await new Promise(r => setTimeout(r, pollMs));
        }
        return failResult({ action: 'wait', sessionId, errors: [{ stage: 'wait', code: 'WAIT_TIMEOUT', message: 'Network never went idle', recoverable: true }] });
    }

    return failResult({ action: 'wait', sessionId, errors: [{ stage: 'wait', code: 'UNSUPPORTED_UNTIL', message: `Unsupported wait.until '${until}'`, recoverable: false }] });
}

async function handleEvaluate(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { function: fnSource, args } = input.params as any;
    const res = await evaluateStructured(session.client, fnSource, args);
    if (!res.ok) {
        return failResult({ action: 'evaluate', sessionId, errors: [{ stage: 'evaluate', code: 'PAGE_FUNCTION_THREW', message: res.error || 'unknown', recoverable: true }] });
    }
    return okResult({ action: 'evaluate', sessionId, data: res.json });
}

async function handleNetwork(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { op, limit = browserBudget.endpointCandidates } = input.params as any;
    if (op === 'clear') {
        session.netLogCursor = session.netLogCursor; // no-op marker; ring buffer clears naturally on next navigate
        return okResult({ action: 'network', sessionId, data: { cleared: true } });
    }
    if (op === 'drain' || op === 'list') {
        const entries = await session.drainInterceptedRequests();
        const summarized = entries.slice(0, limit).map(e => ({
            url: ContextSanitizer.sanitizeString(e.url, 80),
            method: e.method,
            status: e.status,
            contentType: e.contentType,
            bytes: e.bytes,
            summary: ContextSanitizer.summarizeNetworkJsonPayload(e.url, e.body || ''),
        }));
        return okResult({ action: 'network', sessionId, data: summarized, recordCount: summarized.length });
    }
    return failResult({ action: 'network', sessionId, errors: [{ stage: 'network', code: 'UNSUPPORTED_OP', message: `Unsupported network.op '${op}'`, recoverable: false }] });
}

async function handleApiReplay(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { maxCalls = 25, flatten = true, export: doExport = true } = input.params as any;
    const outputDir = defaultOutputDir(input);

    const captured = await session.drainInterceptedRequests();
    if (captured.length === 0) {
        if (session.lastBlockCheck.blocked) {
            reportBlockIfDetected(session, 'api_replay', sessionId);
            return failResult({
                action: 'api_replay', sessionId,
                errors: [{
                    stage: 'api_replay', code: `BLOCKED_BY_${(session.lastBlockCheck.type || 'unknown').toUpperCase()}`,
                    message: `No network traffic captured because the page is a ${session.lastBlockCheck.type || 'unknown'} challenge wall (matched "${session.lastBlockCheck.evidence}")`,
                    recoverable: true,
                }],
            });
        }
        return failResult({ action: 'api_replay', sessionId, errors: [{ stage: 'api_replay', code: 'NO_CAPTURED_TRAFFIC', message: 'No network traffic captured yet — call navigate/click before api_replay', recoverable: true }] });
    }

    const bodies = captured.filter(c => c.body).map(c => c.body!);
    const domIdsRes = await session.evaluate<string[]>(`() => Array.from(document.querySelectorAll('[data-id]')).map(el => el.getAttribute('data-id')).filter(Boolean).slice(0, 50)`);
    const domIds = domIdsRes.ok && Array.isArray(domIdsRes.json) ? domIdsRes.json : [];
    const idCandidates = EndpointTemplater.mineIdCandidates({ bodies, pageUrl: session.currentUrl || '', domIds });

    const ranked = EndpointRanker.topK(captured, browserBudget.endpointCandidates, idCandidates);
    const templates = EndpointTemplater.tokenize(ranked.map(r => r.url));

    const replayUrls = new Set<string>();
    for (const t of templates) {
        for (const u of EndpointTemplater.expand(t, idCandidates, Math.max(1, Math.floor(maxCalls / Math.max(templates.length, 1))))) {
            replayUrls.add(u);
        }
    }
    for (const r of ranked) replayUrls.add(r.url); // always include what we directly observed

    const results: Record<string, any>[] = [];
    const errors: BrowserToolError[] = [];
    let i = 0;
    for (const url of Array.from(replayUrls).slice(0, maxCalls)) {
        i++;
        const res = await session.evaluate<{ ok: boolean; status: number; body: string }>(`(args) => fetch(args.url, { credentials: 'include' }).then(async r => ({ ok: r.ok, status: r.status, body: await r.text() }))`, { url });
        if (!res.ok || !res.json?.ok) {
            errors.push({ stage: 'api_replay', code: 'REPLAY_FAILED', message: `${url}: ${res.error || res.json?.status}`, recoverable: true });
            continue;
        }
        try {
            const payload = JSON.parse(res.json.body);
            if (flatten) {
                const rows = UniversalTabularSchemaFlattener.flattenPayloadToRows(session.currentUrl || 'entity', String(i), payload);
                results.push(...rows);
            } else {
                results.push({ url, payload });
            }
        } catch {
            errors.push({ stage: 'api_replay', code: 'NON_JSON_RESPONSE', message: url, recoverable: true });
        }
        await new Promise(r => setTimeout(r, parseInt(process.env.BROWSER_REPLAY_DELAY_MS || '250', 10)));
    }

    if (results.length === 0) {
        return failResult({ action: 'api_replay', sessionId, errors: errors.length ? errors : [{ stage: 'api_replay', code: 'NO_REPLAYABLE_ENDPOINTS', message: 'No endpoint yielded rows', recoverable: true }] });
    }

    let jsonPath: string | undefined;
    let csvPath: string | undefined;
    if (doExport) {
        const filenameBase = `api_replay_${sessionId}`;
        jsonPath = await ScraperExporter.exportToJSON(results, { outputDir, filenameBase, sourceUrl: session.currentUrl || undefined });
        csvPath = await ScraperExporter.exportToCSV(results, { outputDir, filenameBase, sourceUrl: session.currentUrl || undefined });
    }

    return okResult({
        action: 'api_replay', sessionId, data: results.slice(0, 20), recordCount: results.length,
        jsonPath, csvPath, warnings: errors.map(e => e.message), status: errors.length ? 'partial' : 'ok', confidence: 1,
    });
}

async function handleExtract(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { strategy = 'auto' } = input.params as any;
    const outputDir = defaultOutputDir(input);
    const scraper = new IntelligentBrowserScraper();

    if (strategy === 'api') {
        return handleApiReplay(session, input, sessionId);
    }

    const { text: snapshotText } = await session.snapshot(false);
    if (session.lastBlockCheck.blocked) {
        reportBlockIfDetected(session, 'extract', sessionId);
        return failResult({
            action: 'extract', sessionId, status: 'failed',
            errors: [{
                stage: 'extract', code: `BLOCKED_BY_${(session.lastBlockCheck.type || 'unknown').toUpperCase()}`,
                message: `Page appears to be a ${session.lastBlockCheck.type || 'unknown'} challenge wall (matched "${session.lastBlockCheck.evidence}"), not real content`,
                recoverable: true,
            }],
        });
    }

    const script = await scraper.generateExtractionScriptWithLLM(snapshotText, input.userInstructions || 'Web Page Data', input.userInstructions);
    const res = await evaluateStructured(session.client, script);

    if (!res.ok || !Array.isArray(res.json)) {
        return failResult({
            action: 'extract', sessionId, status: 'failed',
            errors: [{ stage: 'extract', code: 'SCRIPT_EXTRACTION_FAILED', message: res.error || 'Generated extraction script returned no array', recoverable: true }],
        });
    }

    const normalized = await scraper.interpretExtractedDataWithLLM(res.json, input.userInstructions || 'Web Page Data', input.userInstructions);
    if (normalized.status === 'failed' || normalized.records.length === 0) {
        return failResult({
            action: 'extract', sessionId, status: normalized.status,
            errors: normalized.errors.length ? normalized.errors : [{ stage: 'extract', code: 'EMPTY_RESULT_SET', message: 'No records normalized', recoverable: true }],
        });
    }

    const checkpoint = await loadOrInitCheckpoint(outputDir, sessionId, session.currentUrl || input.url);
    checkpoint.accumulatedRecords.push(...normalized.records);
    checkpoint.status = 'COMPLETED';
    const checkpointPath = await ScrapingSessionCheckpointManager.saveCheckpoint(outputDir, checkpoint);

    const filenameBase = `extract_${sessionId}`;
    const jsonPath = await ScraperExporter.exportToJSON(checkpoint.accumulatedRecords, { outputDir, filenameBase, sourceUrl: session.currentUrl || undefined });
    const csvPath = await ScraperExporter.exportToCSV(checkpoint.accumulatedRecords, { outputDir, filenameBase, sourceUrl: session.currentUrl || undefined });

    return okResult({
        action: 'extract', sessionId, data: normalized.records, recordCount: normalized.records.length,
        totalAccumulatedRecords: checkpoint.accumulatedRecords.length, jsonPath, csvPath, checkpointPath,
        status: normalized.status, confidence: normalized.status === 'ok' ? 0.5 : 0.3,
    });
}

async function handleCheckpoint(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { op } = input.params as any;
    const outputDir = defaultOutputDir(input);

    if (op === 'list') {
        const checkpoints = await ScrapingSessionCheckpointManager.listCheckpoints(outputDir);
        return okResult({ action: 'checkpoint', sessionId, data: checkpoints as any, recordCount: checkpoints.length });
    }
    if (op === 'load') {
        const cp = await ScrapingSessionCheckpointManager.loadCheckpoint(outputDir, sessionId);
        if (!cp) return failResult({ action: 'checkpoint', sessionId, errors: [{ stage: 'checkpoint', code: 'NOT_FOUND', message: 'No checkpoint for this session', recoverable: true }] });
        return okResult({ action: 'checkpoint', sessionId, data: cp as any });
    }
    if (op === 'pause' || op === 'resume' || op === 'save') {
        const cp = await loadOrInitCheckpoint(outputDir, sessionId, session.currentUrl || input.url);
        cp.status = op === 'pause' ? 'PAUSED' : op === 'resume' ? 'RESUMED' : cp.status;
        const checkpointPath = await ScrapingSessionCheckpointManager.saveCheckpoint(outputDir, cp);
        return okResult({ action: 'checkpoint', sessionId, data: cp as any, checkpointPath });
    }
    return failResult({ action: 'checkpoint', sessionId, errors: [{ stage: 'checkpoint', code: 'UNSUPPORTED_OP', message: `Unsupported checkpoint.op '${op}'`, recoverable: false }] });
}

async function handleSession(session: BrowserSession, input: BrowserToolInput, sessionId: string, pool: ReturnType<typeof getBrowserSessionPool>): Promise<BrowserActionResult> {
    const { op } = input.params as any;
    if (op === 'status') {
        return okResult({ action: 'session', sessionId, data: { status: session.status, currentUrl: session.currentUrl, engineCaps: session.engineCaps } });
    }
    if (op === 'close') {
        await pool.release(sessionId, true);
        return okResult({ action: 'session', sessionId, data: { closed: true } });
    }
    return failResult({ action: 'session', sessionId, errors: [{ stage: 'session', code: 'UNSUPPORTED_OP', message: `Unsupported session.op '${op}'`, recoverable: false }] });
}

async function handleScreenshot(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { fullPage = false, filename } = input.params as any;
    const outputDir = defaultOutputDir(input);
    const fname = filename || `screenshot_${sessionId}_${Date.now()}.png`;
    const filePath = path.join(outputDir, 'screenshots', fname);
    try {
        await session.call('take_screenshot', { fullPage, filePath });
        return okResult({ action: 'screenshot', sessionId, screenshotPath: filePath, data: { saved: true } });
    } catch (err: any) {
        return failResult({ action: 'screenshot', sessionId, errors: [{ stage: 'screenshot', code: 'SCREENSHOT_FAILED', message: err?.message || String(err), recoverable: true }] });
    }
}

async function handleDeepScrape(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    const { limit = 2 } = input.params as any;
    const outputDir = defaultOutputDir(input);
    const checkpoint = await loadOrInitCheckpoint(outputDir, sessionId, session.currentUrl || input.url);
    const scraper = new IntelligentBrowserScraper();

    const deep = await scraper.deepScrapeItemDetails(session.client, checkpoint.accumulatedRecords, checkpoint.domainContext, limit);
    checkpoint.deepRecords.push(...deep);
    const checkpointPath = await ScrapingSessionCheckpointManager.saveCheckpoint(outputDir, checkpoint);

    return okResult({ action: 'deep_scrape', sessionId, data: deep, recordCount: deep.length, checkpointPath });
}

async function runScrapeMacro(session: BrowserSession, input: BrowserToolInput, sessionId: string): Promise<BrowserActionResult> {
    if (input.url) await handleNavigate(session, input, sessionId);
    await handleWait(session, { ...input, params: { until: 'dom-stable', timeoutMs: 8000, pollMs: 400 } }, sessionId);
    return handleExtract(session, input, sessionId);
}
