import crypto from 'crypto';
import { persistence } from './PersistenceManager.js';

let isOffline = true;
let apiKey = '';
let projectId = '';
let cachedIdToken = '';
let idTokenExpiry = 0;
let cachedRefreshToken = '';

export async function initFirebase(): Promise<string> {
    apiKey = process.env.FIREBASE_API_KEY || '';
    projectId = process.env.FIREBASE_PROJECT_ID || '';

    const state = await persistence.load();

    // Fast-path offline fallback to avoid connection timeouts if a failure happened recently
    const now = Date.now();
    const lastFailed = state.lastAuthFailedTime || 0;
    if (now - lastFailed < 60 * 60 * 1000) {
        isOffline = true;
        if (!state.fallbackUid) {
            state.fallbackUid = crypto.randomUUID();
            await persistence.save(state);
        }
        return state.fallbackUid;
    }

    if (!apiKey || !projectId) {
        console.warn('[Firebase] Firebase configuration missing, running in offline fallback mode.');
        isOffline = true;
        
        if (!state.fallbackUid) {
            state.fallbackUid = crypto.randomUUID();
            await persistence.save(state);
        }
        return state.fallbackUid;
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
                isOffline = false;
                
                (state as any).firebaseRefreshToken = refreshed.refreshToken;
                state.firebaseUid = refreshed.userId;
                await persistence.save(state);

                console.error(`[Firebase Debug] Syncing stats. Authenticated UID: "${refreshed.userId}", Target Document ID: "${refreshed.userId}"`);
                return refreshed.userId;
            }
        }

        // Fallback or brand new sign-in: Sign up anonymously via REST
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
        const res = await fetch(url, {
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
        isOffline = false;

        state.firebaseUid = data.localId;
        (state as any).firebaseRefreshToken = data.refreshToken;
        await persistence.save(state);

        console.error(`[Firebase Debug] Syncing stats. Authenticated UID: "${data.localId}", Target Document ID: "${data.localId}"`);
        return data.localId;
    } catch (error) {
        console.warn(`[Firebase] Connection failed: ${(error as Error).message}. Running in offline fallback mode.`);
        isOffline = true;
        
        state.lastAuthFailedTime = Date.now();
        if (!state.fallbackUid) {
            state.fallbackUid = crypto.randomUUID();
        }
        await persistence.save(state);
        return state.fallbackUid;
    }
}

async function exchangeRefreshToken(refreshToken: string): Promise<{ idToken: string; refreshToken: string; userId: string; expiresIn: number } | null> {
    try {
        const url = `https://securetoken.googleapis.com/v1/token?key=${apiKey}`;
        const res = await fetch(url, {
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
    if (isOffline) return false;
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
        const userRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}?updateMask.fieldPaths=username&updateMask.fieldPaths=lifetimeTokens&updateMask.fieldPaths=lifetimeRequests&updateMask.fieldPaths=lastSyncTime&updateMask.fieldPaths=optOutTelemetry`, {
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

        await fetch(`${dailyUrl}?updateMask.fieldPaths=userId&updateMask.fieldPaths=date&updateMask.fieldPaths=dailyRequests&updateMask.fieldPaths=dailyTokens&updateMask.fieldPaths=lastUpdated`, {
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
    const errMsg = err?.message || String(err);
    if (errMsg.includes('fetch failed') || errMsg.includes('timeout') || errMsg.includes('ConnectTimeoutError') || err?.code === 'UND_ERR_CONNECT_TIMEOUT') {
        console.warn(`${message} (Network offline/timeout: ${errMsg})`);
    } else {
        console.error(message, err);
    }
}

export async function logErrorTelemetry(userId: string, errorMsg: string, stack: string, promptQueue: string[], commsQueue: string[]): Promise<boolean> {
    if (isOffline) return false;
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

        const res = await fetch(url, {
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

export async function getLeaderboard(currentUserId?: string): Promise<any[]> {
    if (isOffline) return [];
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

        const res = await fetch(url, {
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
            const userRes = await fetch(userUrl, {
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
        logFirebaseError('[Firebase] Failed to get leaderboard', err);
        return [];
    }
}
