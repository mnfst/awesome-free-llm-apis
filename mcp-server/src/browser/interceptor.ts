import { browserBudget } from './BudgetPolicy.js';

/**
 * In-page fetch()/XHR interceptor. Installed immediately after every navigate
 * (BrowserSession.navigate). Solves W1: chrome-devtools-mcp's list_network_requests
 * only returns a markdown-formatted URL list, so this patches the page's own
 * fetch/XHR to capture method/status/contentType/body into a ring buffer that
 * drainInterceptedRequests() reads out incrementally.
 *
 * Re-hooks history.pushState/replaceState so SPA route changes (tab clicks that
 * don't trigger a full navigation — exactly how SofaScore loads player stats)
 * don't lose interception.
 */
export const INTERCEPTOR_INSTALL_SCRIPT = `() => {
    if (window.__bt && window.__bt.installed) return 'already installed';
    const bodyCap = ${browserBudget.maxBodyBytes};
    const ringCap = 200;
    window.__bt = window.__bt || {};
    const state = window.__bt;
    state.installed = true;
    state.log = state.log || [];
    state.seq = state.seq || 0;

    function pushEntry(entry) {
        state.log.push(entry);
        if (state.log.length > ringCap) state.log.shift();
    }

    if (!state.fetchPatched) {
        state.fetchPatched = true;
        const origFetch = window.fetch.bind(window);
        window.fetch = function(...args) {
            const url = (args[0] && args[0].url) || args[0];
            const method = (args[1] && args[1].method) || 'GET';
            return origFetch.apply(window, args).then(async (res) => {
                try {
                    const clone = res.clone();
                    const ct = clone.headers.get('content-type') || '';
                    let body = '';
                    let truncated = false;
                    if (ct.includes('json') || ct.includes('text')) {
                        const text = await clone.text();
                        truncated = text.length > bodyCap;
                        body = truncated ? text.slice(0, bodyCap) : text;
                    }
                    pushEntry({
                        seq: ++state.seq, url: String(url), method, status: res.status,
                        contentType: ct, bytes: body.length, body, truncated, ts: Date.now(),
                    });
                } catch (e) { /* never break the real fetch on capture failure */ }
                return res;
            });
        };
    }

    if (!state.xhrPatched) {
        state.xhrPatched = true;
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.__bt_method = method;
            this.__bt_url = url;
            return origOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('readystatechange', () => {
                if (this.readyState === 4) {
                    try {
                        const ct = this.getResponseHeader('content-type') || '';
                        let body = this.responseText || '';
                        const truncated = body.length > bodyCap;
                        if (truncated) body = body.slice(0, bodyCap);
                        pushEntry({
                            seq: ++state.seq, url: String(this.__bt_url), method: this.__bt_method || 'GET',
                            status: this.status, contentType: ct, bytes: body.length, body, truncated, ts: Date.now(),
                        });
                    } catch (e) { /* ignore */ }
                }
            });
            return origSend.apply(this, args);
        };
    }

    if (!state.historyPatched) {
        state.historyPatched = true;
        const wrap = (fn) => function(...args) {
            const r = fn.apply(history, args);
            window.dispatchEvent(new Event('__bt_locationchange'));
            return r;
        };
        history.pushState = wrap(history.pushState);
        history.replaceState = wrap(history.replaceState);
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('__bt_locationchange')));
    }

    return 'installed';
}`;

/** Reads and clears entries with seq > `since` from the ring buffer. */
export const INTERCEPTOR_DRAIN_SCRIPT = `(args) => {
    const since = (args && args.since) || 0;
    const state = window.__bt || { log: [], seq: 0 };
    const entries = (state.log || []).filter(e => e.seq > since);
    return { entries, cursor: state.seq || since };
}`;
