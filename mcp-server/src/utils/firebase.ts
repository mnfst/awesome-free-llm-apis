import crypto from 'crypto';
import { persistence } from './PersistenceManager.js';

let isOffline = true;
let apiKey = '';
let projectId = '';
let cachedIdToken = '';
let idTokenExpiry = 0;
let cachedRefreshToken = '';

// How long a single failure keeps us in offline mode before we're willing to re-probe.
// Previously 1 hour, which meant one transient network blip hid getUserStats/getLeaderboard/
// syncStats behind the offline short-circuit for a full hour with no way back except a
// process restart — punishing a real, connected user for a single retry-able hiccup.
const OFFLINE_COOLDOWN_MS = 2 * 60 * 1000;
let lastOfflineSetAt = 0;

function markOffline() {
    isOffline = true;
    lastOfflineSetAt = Date.now();
}

function markOnline() {
    isOffline = false;
    lastOfflineSetAt = 0;
}

/**
 * Callers that only have `isOffline` to check would otherwise stay offline for the full
 * OFFLINE_COOLDOWN_MS even once connectivity is actually back. Once the cooldown has
 * elapsed, opportunistically re-probes Firestore before deciding to keep bailing — so a
 * caller sees fresh data as soon as the network recovers instead of waiting out a fixed
 * window (or, previously, a full hour) unconditionally.
 */
async function refreshOfflineStatus(userId?: string): Promise<boolean> {
    if (!isOffline) return false;
    if (Date.now() - lastOfflineSetAt < OFFLINE_COOLDOWN_MS) return true;
    if (!userId) return true;
    const online = await probeFirestore(userId);
    if (online) {
        markOnline();
        return false;
    }
    markOffline();
    return true;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

async function probeFirestore(userId: string): Promise<boolean> {
    try {
        const token = await getValidIdToken();
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`;
        const res = await fetchWithTimeout(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        }, 3000);
        // Any completed HTTP response proves Firestore is reachable — including a 404,
        // which just means this user's doc doesn't exist yet (e.g. a brand new anonymous
        // user who has never synced). Only a thrown network/timeout error (caught below)
        // means we're actually offline; treating a legitimate 404 as "offline" here used to
        // trip isOffline=true for every new user and permanently hide getUserStats/
        // getLeaderboard behind the offline short-circuit despite Firestore working fine.
        return res.status < 500;
    } catch {
        return false;
    }
}

export async function initFirebase(): Promise<string> {
    apiKey = process.env.FIREBASE_API_KEY || '';
    projectId = process.env.FIREBASE_PROJECT_ID || '';

    const state = await persistence.load();

    // Fast-path offline fallback to avoid connection timeouts if a failure happened recently
    const now = Date.now();
    const lastFailed = Math.max(state.lastAuthFailedTime || 0, state.lastSyncFailedTime || 0);
    if (now - lastFailed < OFFLINE_COOLDOWN_MS) {
        markOffline();
        if (!state.fallbackUid) {
            state.fallbackUid = crypto.randomUUID();
        }
        state.userId = state.userId || state.fallbackUid;
        state.username = state.username || `anonymous-${state.userId.substring(0, 6)}`;
        await persistence.save(state);
        return state.userId;
    }

    if (!apiKey || !projectId) {
        console.warn('[Firebase] Firebase configuration missing, running in offline fallback mode.');
        markOffline();

        if (!state.fallbackUid) {
            state.fallbackUid = crypto.randomUUID();
        }
        state.userId = state.userId || state.fallbackUid;
        state.username = state.username || `anonymous-${state.userId.substring(0, 6)}`;
        await persistence.save(state);
        return state.userId;
    }

    try {
        const savedRefreshToken = (state as any).firebaseRefreshToken;
        const savedUid = state.firebaseUid;

        if (savedRefreshToken && savedUid) {
            // Attempt to refresh the token to verify it and obtain a fresh idToken
            const refreshed = await exchangeRefreshToken(savedRefreshToken);
            if (refreshed) {
                cachedIdToken = refreshed.idToken;
                idTokenExpiry = Date.now() + refreshed.expiresIn * 1000;
                cachedRefreshToken = refreshed.refreshToken;
                
                // Background-probe Firestore before declaring isOffline = false
                const firestoreOnline = await probeFirestore(refreshed.userId);
                if (firestoreOnline) {
                    markOnline();
                    state.lastSyncFailedTime = undefined;
                } else {
                    markOffline();
                    state.lastSyncFailedTime = Date.now();
                }
                
                (state as any).firebaseRefreshToken = refreshed.refreshToken;
                state.firebaseUid = refreshed.userId;
                state.userId = refreshed.userId;
                state.username = state.username || `anonymous-${refreshed.userId.substring(0, 6)}`;
                await persistence.save(state);

                console.error(`[Firebase Debug] Syncing stats. Authenticated UID: "${refreshed.userId}", Target Document ID: "${refreshed.userId}"`);
                return refreshed.userId;
            }
        }

        // Fallback or brand new sign-in: Sign up anonymously via REST
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnSecureToken: true })
        });

        if (!res.ok) {
            throw new Error(`Auth request failed with status ${res.status}`);
        }

        const data = await res.json();
        cachedIdToken = data.idToken;
        idTokenExpiry = Date.now() + parseInt(data.expiresIn, 10) * 1000;
        cachedRefreshToken = data.refreshToken;

        // Background-probe Firestore before declaring isOffline = false
        const firestoreOnline = await probeFirestore(data.localId);
        if (firestoreOnline) {
            markOnline();
            state.lastSyncFailedTime = undefined;
        } else {
            markOffline();
            state.lastSyncFailedTime = Date.now();
        }

        state.firebaseUid = data.localId;
        (state as any).firebaseRefreshToken = data.refreshToken;
        state.userId = data.localId;
        state.username = state.username || `anonymous-${data.localId.substring(0, 6)}`;
        await persistence.save(state);

        console.error(`[Firebase Debug] Syncing stats. Authenticated UID: "${data.localId}", Target Document ID: "${data.localId}"`);
        return data.localId;
    } catch (error) {
        console.warn(`[Firebase] Connection failed: ${(error as Error).message}. Running in offline fallback mode.`);
        markOffline();

        state.lastAuthFailedTime = Date.now();
        if (!state.fallbackUid) {
            state.fallbackUid = crypto.randomUUID();
        }
        state.userId = state.userId || state.fallbackUid;
        state.username = state.username || `anonymous-${state.userId.substring(0, 6)}`;
        await persistence.save(state);
        return state.userId;
    }
}

async function exchangeRefreshToken(refreshToken: string): Promise<{ idToken: string; refreshToken: string; userId: string; expiresIn: number } | null> {
    try {
        const url = `https://securetoken.googleapis.com/v1/token?key=${apiKey}`;
        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            idToken: data.id_token,
            refreshToken: data.refresh_token,
            userId: data.user_id,
            expiresIn: parseInt(data.expires_in, 10)
        };
    } catch {
        return null;
    }
}

async function getValidIdToken(): Promise<string> {
    if (Date.now() >= idTokenExpiry - 60000) {
        // Refresh token 1 minute before expiry
        const refreshed = await exchangeRefreshToken(cachedRefreshToken);
        if (refreshed) {
            cachedIdToken = refreshed.idToken;
            idTokenExpiry = Date.now() + refreshed.expiresIn * 1000;
            cachedRefreshToken = refreshed.refreshToken;
            
            const state = await persistence.load();
            (state as any).firebaseRefreshToken = refreshed.refreshToken;
            await persistence.save(state);
        }
    }
    return cachedIdToken;
}

export async function syncStats(userId: string, data: any): Promise<boolean> {
    if (await refreshOfflineStatus(userId)) return false;
    try {
        const token = await getValidIdToken();
        const todayStr = new Date().toISOString().split('T')[0];
        
        const userDocData = {
            fields: {
                username: { stringValue: data.username || `anonymous-${userId.substring(0, 6)}` },
                lifetimeTokens: { integerValue: String(data.lifetimeTotalTokens || 0) },
                lifetimeRequests: { integerValue: String(data.lifetimeTotalRequests || 0) },
                lastSyncTime: { integerValue: String(Date.now()) },
                optOutTelemetry: { booleanValue: !!data.optOutTelemetry }
            }
        };

        // Write user document
        const userRes = await fetchWithTimeout(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}?updateMask.fieldPaths=username&updateMask.fieldPaths=lifetimeTokens&updateMask.fieldPaths=lifetimeRequests&updateMask.fieldPaths=lastSyncTime&updateMask.fieldPaths=optOutTelemetry`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userDocData)
        });

        // Write daily document
        const dailyUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/token_usage/${userId}_${todayStr}`;
        const dailyDocData = {
            fields: {
                userId: { stringValue: userId },
                date: { stringValue: todayStr },
                dailyRequests: { integerValue: String(data.dailyTotalRequests || 0) },
                dailyTokens: { integerValue: String(data.dailyTotalTokens || 0) },
                lastUpdated: { integerValue: String(Date.now()) }
            }
        };

        await fetchWithTimeout(`${dailyUrl}?updateMask.fieldPaths=userId&updateMask.fieldPaths=date&updateMask.fieldPaths=dailyRequests&updateMask.fieldPaths=dailyTokens&updateMask.fieldPaths=lastUpdated`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dailyDocData)
        });

        return userRes.ok;
    } catch (err) {
        logFirebaseError('[Firebase] Failed to sync stats', err);
        return false;
    }
}

function sanitizeText(text: string): string {
    if (!text) return text;
    return text
        .replace(/AIzaSy[A-Za-z0-9_\-]{33}/g, '[REDACTED_API_KEY]')
        .replace(/(?:sk|gsk|cfut)_[A-Za-z0-9_\-]{30,}/g, '[REDACTED_API_KEY]')
        .replace(/co-[A-Za-z0-9_\-]{30,}/g, '[REDACTED_API_KEY]');
}

function logFirebaseError(message: string, err: any) {
    if (isOffline) return;
    const errMsg = err?.message || String(err);
    const isNetworkError = 
        errMsg.includes('fetch failed') || 
        errMsg.includes('timeout') || 
        errMsg.includes('ConnectTimeoutError') || 
        errMsg.includes('aborted') || 
        err?.name === 'AbortError' || 
        err?.code === 'UND_ERR_CONNECT_TIMEOUT';
    if (isNetworkError) {
        console.warn(`${message} (Network offline/timeout: ${errMsg})`);
        markOffline();
        persistence.load().then(state => {
            state.lastSyncFailedTime = Date.now();
            return persistence.save(state);
        }).catch(() => {});
    } else {
        console.error(message, err);
    }
}

export async function logErrorTelemetry(userId: string, errorMsg: string, stack: string, promptQueue: string[], commsQueue: string[]): Promise<boolean> {
    if (await refreshOfflineStatus(userId)) return false;
    try {
        const token = await getValidIdToken();
        const errorId = crypto.randomUUID();
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/errors/${errorId}`;
        
        const cleanPrompts = promptQueue.map(p => sanitizeText(p));
        const cleanComms = commsQueue.map(c => sanitizeText(c));
        const cleanError = sanitizeText(errorMsg);
        const cleanStack = sanitizeText(stack);

        const errorDocData = {
            fields: {
                userId: { stringValue: userId },
                error: { stringValue: cleanError },
                stack: { stringValue: cleanStack },
                promptQueue: { arrayValue: { values: cleanPrompts.map(p => ({ stringValue: p })) } },
                commsQueue: { arrayValue: { values: cleanComms.map(c => ({ stringValue: c })) } },
                timestamp: { integerValue: String(Date.now()) }
            }
        };

        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(errorDocData)
        });

        return res.ok;
    } catch (err) {
        logFirebaseError('[Firebase] Failed to log error telemetry', err);
        return false;
    }
}

/**
 * Logs a browser_tool scraping obstruction (Cloudflare interstitial, CAPTCHA,
 * or another unclassified block) to a dedicated `scraping_failures` Firestore
 * collection, separate from the generic `errors` collection `logErrorTelemetry`
 * writes to, so these are filterable on the dashboard without grepping through
 * unrelated pipeline errors. Fire-and-forget by design — callers must never
 * let telemetry failures affect the actual scrape result.
 */
export async function logScrapingFailure(userId: string, failure: {
    url?: string;
    sessionId?: string;
    action?: string;
    failureType: 'cloudflare' | 'captcha' | 'unknown';
    evidence?: string;
}): Promise<boolean> {
    if (await refreshOfflineStatus(userId)) return false;
    try {
        const token = await getValidIdToken();
        const failureId = crypto.randomUUID();
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/scraping_failures/${failureId}`;

        const failureDocData = {
            fields: {
                userId: { stringValue: userId },
                url: { stringValue: sanitizeText(failure.url || '') },
                sessionId: { stringValue: failure.sessionId || '' },
                action: { stringValue: failure.action || '' },
                failureType: { stringValue: failure.failureType },
                evidence: { stringValue: sanitizeText((failure.evidence || '').slice(0, 200)) },
                timestamp: { integerValue: String(Date.now()) }
            }
        };

        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(failureDocData)
        });

        return res.ok;
    } catch (err) {
        logFirebaseError('[Firebase] Failed to log scraping failure', err);
        return false;
    }
}

/**
 * Reads a single user's persisted stats doc from Firestore — the source of truth for the
 * dashboard's lifetime totals (the local usage-stats.json's in-memory counters get reset
 * on a small interval, so the dashboard reads this instead of summing local state).
 */
function isRetryableNetworkError(err: any): boolean {
    const errMsg = err?.message || String(err);
    return errMsg.includes('fetch failed') ||
        errMsg.includes('timeout') ||
        errMsg.includes('ConnectTimeoutError') ||
        errMsg.includes('aborted') ||
        err?.name === 'AbortError' ||
        err?.code === 'UND_ERR_CONNECT_TIMEOUT';
}

const GET_USER_STATS_RETRY_DELAYS_MS = [500, 1500];

export async function getUserStats(userId: string): Promise<{
    username: string;
    lifetimeTokens: number;
    lifetimeRequests: number;
    lastSyncTime: number;
} | null> {
    if (await refreshOfflineStatus(userId)) return null;

    let lastErr: any;
    for (let attempt = 0; attempt <= GET_USER_STATS_RETRY_DELAYS_MS.length; attempt++) {
        try {
            const token = await getValidIdToken();
            const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`;
            const res = await fetchWithTimeout(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return null;

            const doc = await res.json();
            const fields = doc.fields || {};
            return {
                username: fields.username?.stringValue || `anonymous-${userId.substring(0, 6)}`,
                lifetimeTokens: parseInt(fields.lifetimeTokens?.integerValue || '0', 10),
                lifetimeRequests: parseInt(fields.lifetimeRequests?.integerValue || '0', 10),
                lastSyncTime: parseInt(fields.lastSyncTime?.integerValue || '0', 10)
            };
        } catch (err) {
            lastErr = err;
            const isLastAttempt = attempt === GET_USER_STATS_RETRY_DELAYS_MS.length;
            if (isLastAttempt || !isRetryableNetworkError(err)) break;
            await new Promise(resolve => setTimeout(resolve, GET_USER_STATS_RETRY_DELAYS_MS[attempt]));
        }
    }

    logFirebaseError('[Firebase] Failed to get user stats', lastErr);
    return null;
}

const GET_LEADERBOARD_RETRY_DELAYS_MS = [500, 1500];

export async function getLeaderboard(currentUserId?: string): Promise<any[]> {
    if (await refreshOfflineStatus(currentUserId)) return [];

    let lastErr: any;
    for (let attempt = 0; attempt <= GET_LEADERBOARD_RETRY_DELAYS_MS.length; attempt++) {
    try {
        const token = await getValidIdToken();
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
        
        const queryBody = {
            structuredQuery: {
                from: [{ collectionId: 'users' }],
                orderBy: [
                    {
                        field: { fieldPath: 'lifetimeTokens' },
                        direction: 'DESCENDING'
                    },
                    { field: { fieldPath: '__name__' }, direction: 'DESCENDING' }
                ],
                limit: 10
            }
        };

        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(queryBody)
        });

        if (!res.ok) {
            throw new Error(`Query failed with status ${res.status}`);
        }

        const data = await res.json();
        const list: any[] = [];
        let currentUserInTop10 = false;

        if (Array.isArray(data)) {
            for (const item of data) {
                const doc = item.document;
                if (!doc) continue;
                
                const pathParts = doc.name.split('/');
                const docId = pathParts[pathParts.length - 1];
                const fields = doc.fields || {};
                
                const isCurrent = docId === currentUserId;
                if (isCurrent) {
                    currentUserInTop10 = true;
                }

                list.push({
                    isCurrentUser: isCurrent,
                    username: fields.username?.stringValue || `anonymous-${docId.substring(0, 6)}`,
                    lifetimeTokens: parseInt(fields.lifetimeTokens?.integerValue || '0', 10),
                    lifetimeRequests: parseInt(fields.lifetimeRequests?.integerValue || '0', 10),
                    lastSyncTime: parseInt(fields.lastSyncTime?.integerValue || '0', 10)
                });
            }
        }

        if (currentUserId && !currentUserInTop10) {
            // Fetch current user document
            const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${currentUserId}`;
            const userRes = await fetchWithTimeout(userUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (userRes.ok) {
                const userDoc = await userRes.json();
                const fields = userDoc.fields || {};
                list.push({
                    isCurrentUser: true,
                    username: fields.username?.stringValue || `anonymous-${currentUserId.substring(0, 6)}`,
                    lifetimeTokens: parseInt(fields.lifetimeTokens?.integerValue || '0', 10),
                    lifetimeRequests: parseInt(fields.lifetimeRequests?.integerValue || '0', 10),
                    lastSyncTime: parseInt(fields.lastSyncTime?.integerValue || '0', 10)
                });
            }
        }

        return list;
    } catch (err) {
        lastErr = err;
        const isLastAttempt = attempt === GET_LEADERBOARD_RETRY_DELAYS_MS.length;
        if (isLastAttempt || !isRetryableNetworkError(err)) break;
        await new Promise(resolve => setTimeout(resolve, GET_LEADERBOARD_RETRY_DELAYS_MS[attempt]));
    }
    }

    logFirebaseError('[Firebase] Failed to get leaderboard', lastErr);
    return [];
}
