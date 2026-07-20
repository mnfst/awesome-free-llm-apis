import { debounce } from './debounce.js';
import { persistence, PersistentUsage } from './PersistenceManager.js';
import { getSharedEncoder } from './tiktoken.js';
import type { Message, ChatResponse } from '../providers/types.js';
import { ProviderRegistry } from '../providers/registry.js';
import { TaskType, type PipelineContext } from '../pipeline/middleware.js';
import { getMessageContent, prependToMessageContent } from './MessageUtils.js';
import { Sanitizer } from './Sanitizer.js';
import { calculateModelWeightedMaxTokens } from './model-tokens.js';

export interface TokenTrackingInfo {
    remainingTokens?: number;
    refreshTime?: number;
    remainingRequests?: number;
    requestsRefreshTime?: number;
    lastSuccessTime?: number;
    localTotalRequests?: number;
    localTotalTokens?: number;
    dailyTotalRequests?: number;
    dailyTotalTokens?: number;
}

/**
 * LLMExecutor - Utility class for executing LLM API calls with token management.
 * 
 * This class extracts the core execution logic from TokenManagerMiddleware and
 * the removed LLMExecutionMiddleware so it can be called multiple times in fallback scenarios
 * without violating the middleware single-call contract.
 */
export class LLMExecutor {
    private tokenTracking: Record<string, TokenTrackingInfo> = {};
    private get encoder() {
        return getSharedEncoder();
    }
    private persistence = persistence;
    private saveStats = debounce(() => this.persistStats(), 2000);
    private localPersistInterval: ReturnType<typeof setInterval> | null = null;

    // Small-interval local disk sync, separate from Firebase's ~24h sync (server.ts's
    // initTelemetry, gated on state.lastSyncTime). Keeps usage-stats.json current without
    // waiting on the 2s write-debounce alone, and is the point at which in-memory usage
    // counters get reset — the dashboard should not rely on these local counters staying
    // authoritative between resets (see getUserStats()-backed /api/token-stats).
    private static readonly LOCAL_PERSIST_INTERVAL_MS = parseInt(process.env.LOCAL_PERSIST_INTERVAL_MS || '', 10) || 60_000;

    private static readonly CIRCUIT_THRESHOLD = 2; // Fail over faster
    private static readonly CIRCUIT_COOLDOWN = 45000; // Longer cooldown for 429s

    private providerCircuits: Map<string, {
        failures: number;
        lastFailure: number;
        cooldownUntil: number;
        totalErrors: number;
        lastSuccess?: number;
    }> = new Map();

    public isProviderCircuitOpen(providerId: string): boolean {
        const cb = this.providerCircuits.get(providerId);
        if (!cb) return false;

        return Date.now() < cb.cooldownUntil;
    }

    public recordProviderFailure(providerId: string, status?: number): void {
        let cb = this.providerCircuits.get(providerId);
        if (!cb) {
            cb = { failures: 0, lastFailure: 0, cooldownUntil: 0, totalErrors: 0 };
            this.providerCircuits.set(providerId, cb);
        }

        cb.failures++;
        cb.lastFailure = Date.now();
        cb.totalErrors++;

        if (cb.failures >= LLMExecutor.CIRCUIT_THRESHOLD) {
            // Adaptive cooldown: 15s for rate limits (429), 60s for server errors (500)
            const waitTime = status === 429 ? 15000 : 60000;
            cb.cooldownUntil = Date.now() + waitTime;
            console.error(`[LLMExecutor] Circuit OPEN for ${providerId} (status ${status}) after ${cb.failures} failures. Cooling down ${waitTime / 1000}s.`);
        }
    }

    public recordProviderSuccess(providerId: string): void {
        const cb = this.providerCircuits.get(providerId);
        if (cb) {
            cb.failures = 0;
            cb.cooldownUntil = 0; // Immediate reset on success
            cb.lastSuccess = Date.now();
        } else {
            this.providerCircuits.set(providerId, {
                failures: 0,
                lastFailure: 0,
                cooldownUntil: 0,
                totalErrors: 0,
                lastSuccess: Date.now()
            });
        }
    }

    public getProviderStats(): Record<string, { errors: number; circuitOpen: boolean; cooldownRemaining?: number; lastSuccessTime?: number }> {
        const stats: Record<string, { errors: number; circuitOpen: boolean; cooldownRemaining?: number; lastSuccessTime?: number }> = {};
        const now = Date.now();
        for (const [providerId, cb] of this.providerCircuits) {
            stats[providerId] = {
                errors: cb.totalErrors,
                circuitOpen: now < cb.cooldownUntil,
                cooldownRemaining: now < cb.cooldownUntil ? cb.cooldownUntil - now : 0,
                lastSuccessTime: cb.lastSuccess
            };
        }
        return stats;
    }

    public refundTokens(providerId: string, tokens: number): void {
        const tracker = this.tokenTracking[providerId];
        if (!tracker) return;

        tracker.localTotalRequests = Math.max(0, (tracker.localTotalRequests || 0) - 1);
        tracker.localTotalTokens = Math.max(0, (tracker.localTotalTokens || 0) - tokens);
        tracker.dailyTotalRequests = Math.max(0, (tracker.dailyTotalRequests || 0) - 1);
        tracker.dailyTotalTokens = Math.max(0, (tracker.dailyTotalTokens || 0) - tokens);

        if (tracker.remainingTokens !== undefined) {
            tracker.remainingTokens = Math.min(tracker.remainingTokens + tokens, 100000);
        }
        if (tracker.remainingRequests !== undefined) {
            tracker.remainingRequests = Math.min((tracker.remainingRequests || 0) + 1, 100);
        }
    }

    /**
     * Initializes the executor by loading persisted usage stats
     */
    async init(): Promise<void> {
        const stats = await this.persistence.load();
        
        // Merge persisted stats into tokenTracking
        for (const [id, prov] of Object.entries(stats.providers)) {
            this.tokenTracking[id] = {
                localTotalRequests: prov.localTotalRequests,
                localTotalTokens: prov.localTotalTokens,
                remainingRequests: prov.remainingRequests ?? undefined,
                remainingTokens: prov.remainingTokens ?? undefined,
                lastSuccessTime: prov.lastSyncTime
            };

            // Restore circuit breaker persistence
            if (prov.cooldownUntil || prov.failures || prov.totalErrors) {
                this.providerCircuits.set(id, {
                    failures: prov.failures || 0,
                    lastFailure: prov.lastFailure || 0,
                    cooldownUntil: prov.cooldownUntil || 0,
                    totalErrors: prov.totalErrors || 0
                });
            }
        }

        // Global daily counters are managed via the persistence manager internally
        // but we can expose them if needed for the dashboard summary.

        if (!this.localPersistInterval) {
            this.localPersistInterval = setInterval(() => {
                this.periodicPersistAndReset().catch(err => {
                    console.error('[LLMExecutor] Periodic local persist failed:', err);
                });
            }, LLMExecutor.LOCAL_PERSIST_INTERVAL_MS);
            if (typeof this.localPersistInterval.unref === 'function') {
                this.localPersistInterval.unref();
            }
        }
    }

    /**
     * Flushes current usage counters to usage-stats.json, then resets the in-memory
     * accumulator counters to zero (not the live rate-limit fields — remainingRequests/
     * remainingTokens/lastSuccessTime stay intact, since routing decisions depend on those
     * staying current). persistence.resetBaseline() must run right after, in the same tick,
     * so the next delta computation starts from zero instead of going negative against the
     * pre-reset baseline (see resetBaseline()'s doc comment).
     */
    private async periodicPersistAndReset(): Promise<void> {
        await this.persistStats();
        for (const tracker of Object.values(this.tokenTracking)) {
            tracker.localTotalRequests = 0;
            tracker.localTotalTokens = 0;
            tracker.dailyTotalRequests = 0;
            tracker.dailyTotalTokens = 0;
        }
        this.persistence.resetBaseline();
    }

    /**
     * Immediately persists current usage stats to disk, bypassing the debounce.
     * Must be called before process exit — deductTokens() only schedules a
     * debounced save (2s), so a shutdown that doesn't wait for it (or that
     * discards in-memory state via flush() first) silently drops the last
     * batch of usage counters, which looks like "usage keeps resetting".
     */
    async persistNow(): Promise<void> {
        await this.persistStats();
    }

    /**
     * Persists current state to disk
     */
    private async persistStats(): Promise<void> {
        const state: PersistentUsage = {
            lastResetDate: new Date().toISOString().split('T')[0],
            dailyTotalRequests: 0, // This is actually managed by merging in PersistenceManager
            dailyTotalTokens: 0,
            lifetimeTotalRequests: 0,
            lifetimeTotalTokens: 0,
            lastLocalPersistTime: Date.now(),
            providers: {}
        };

        for (const [id, tracker] of Object.entries(this.tokenTracking)) {
            const cb = this.providerCircuits.get(id);
            state.providers[id] = {
                lastSyncTime: tracker.lastSuccessTime || Date.now(),
                localTotalRequests: tracker.localTotalRequests || 0,
                localTotalTokens: tracker.localTotalTokens || 0,
                remainingRequests: tracker.remainingRequests,
                remainingTokens: tracker.remainingTokens,
                failures: cb?.failures || 0,
                lastFailure: cb?.lastFailure || 0,
                cooldownUntil: cb?.cooldownUntil || 0,
                totalErrors: cb?.totalErrors || 0
            };
            
            // Increment totals (PersistenceManager will merge these)
            state.lifetimeTotalRequests += tracker.localTotalRequests || 0;
            state.lifetimeTotalTokens += tracker.localTotalTokens || 0;
            state.dailyTotalRequests += tracker.dailyTotalRequests || 0; 
            state.dailyTotalTokens += tracker.dailyTotalTokens || 0;
        }

        await this.persistence.save(state);
    }

    /**
     * Calculate estimated tokens for a request
     */
    calculateTokens(messages: Message[]): number {
        let totalChars = 0;
        for (const msg of messages) {
            totalChars += getMessageContent(msg).length;
        }

        // Optimization: If the string is massive (> 20k chars), 
        // return a safe upper bound estimate immediately
        // to avoid hanging on Tiktoken encoding.
        if (totalChars > 20000) {
            return Math.ceil(totalChars / 2); // Very conservative estimate (2 chars per token)
        }

        let total = 0;
        for (const msg of messages) {
            total += this.encoder.encode(getMessageContent(msg)).length + 4;
        }
        return total;
    }

    /**
     * Get a token and RPM-based health score for a provider (0-1)
     */
    getTokenScore(providerId: string): number {
        const tracker = this.tokenTracking[providerId];
        if (!tracker) return 1.0; // Assume healthy if no info

        let score = 1.0;

        if (tracker.remainingTokens !== undefined) {
            if (tracker.refreshTime && Date.now() >= tracker.refreshTime) {
                // Tokens refreshed
            } else {
                // Normalize score: 100k tokens = 1.0 score
                score = Math.min(score, tracker.remainingTokens / 100000);
            }
        }

        if (tracker.remainingRequests !== undefined) {
            if (tracker.requestsRefreshTime && Date.now() >= tracker.requestsRefreshTime) {
                // Requests refreshed
            } else {
                if (tracker.remainingRequests < 2) {
                    score = Math.min(score, 0.1); // Severely penalize if almost out of requests
                } else if (tracker.remainingRequests < 10) {
                    score = Math.min(score, 0.5); // Penalize if getting low
                }
            }
        }

        return Math.max(0, score);
    }

    /**
     * Check if provider has enough tokens and requests available
     */
    hasEnoughTokens(providerId: string, requiredTokens: number): boolean {
        const tracker = this.tokenTracking[providerId];
        if (!tracker) return true;

        let tokensOk = true;
        let requestsOk = true;

        if (tracker.remainingTokens !== undefined) {
            if (tracker.refreshTime && Date.now() >= tracker.refreshTime) {
                tracker.remainingTokens = undefined; // Lazy clear
            } else {
                tokensOk = tracker.remainingTokens >= requiredTokens;
            }
        }

        if (tracker.remainingRequests !== undefined) {
            if (tracker.requestsRefreshTime && Date.now() >= tracker.requestsRefreshTime) {
                tracker.remainingRequests = undefined;
            } else {
                requestsOk = tracker.remainingRequests > 0;
            }
        }

        return tokensOk && requestsOk;
    }

    /**
     * Deduct tokens and requests from provider's tracked quota
     */
    public deductTokens(providerId: string, tokens: number): void {
        if (!this.tokenTracking[providerId]) {
            this.tokenTracking[providerId] = {
                localTotalRequests: 0,
                localTotalTokens: 0,
                dailyTotalRequests: 0,
                dailyTotalTokens: 0
            };
        }
        
        const tracker = this.tokenTracking[providerId];
        
        // Update local and daily totals
        tracker.localTotalRequests = (tracker.localTotalRequests || 0) + 1;
        tracker.localTotalTokens = (tracker.localTotalTokens || 0) + tokens;
        tracker.dailyTotalRequests = (tracker.dailyTotalRequests || 0) + 1;
        tracker.dailyTotalTokens = (tracker.dailyTotalTokens || 0) + tokens;

        if (tracker.remainingTokens !== undefined) {
            tracker.remainingTokens -= tokens;
        }
        if (tracker.remainingRequests !== undefined) {
            tracker.remainingRequests -= 1;
        }

        // Trigger persistence
        this.saveStats();
    }

    /**
     * Set token tracking state manually for a specific provider (primarily for testing)
     */
    updateProviderTokenState(providerId: string, info: Partial<TokenTrackingInfo>): void {
        this.tokenTracking[providerId] = {
            ...this.tokenTracking[providerId],
            ...info,
            lastSuccessTime: Date.now()
        };
    }

    /**
     * Update token tracking from response headers (drift correction)
     */
    private updateTokenTracking(providerId: string, headers: Record<string, string | string[] | undefined>): void {
        if (!headers) return;

        // Helper to get first string value from header (handles arrays)
        const getHeader = (key: string): string | undefined => {
            const val = headers[key];
            if (Array.isArray(val)) return val[0];
            return val;
        };

        // Look for standard rate limit headers across various providers
        const remainingTokensStr =
            getHeader('x-ratelimit-remaining-tokens') ||
            getHeader('x-ratelimit-remaining-tokens-minute') ||
            getHeader('x-ratelimit-tokens-remaining');

        const remainingRequestsStr =
            getHeader('x-ratelimit-remaining-requests') ||
            getHeader('x-ratelimit-requests-remaining') ||
            getHeader('x-ratelimit-remaining-requests-minute');

        const resetTokensTimeStr = getHeader('x-ratelimit-reset-tokens');
        const resetRequestsTimeStr = getHeader('x-ratelimit-reset-requests');

        this.tokenTracking[providerId] = this.tokenTracking[providerId] || {};
        this.tokenTracking[providerId].lastSuccessTime = Date.now();

        if (remainingTokensStr) {
            const remaining = parseInt(remainingTokensStr, 10);
            if (!isNaN(remaining)) {
                this.tokenTracking[providerId].remainingTokens = remaining;

                if (resetTokensTimeStr) {
                    const resetVal = parseFloat(resetTokensTimeStr);
                    if (!isNaN(resetVal)) {
                        this.tokenTracking[providerId].refreshTime = Date.now() + (resetVal * 1000);
                    }
                }
            }
        }

        if (remainingRequestsStr) {
            const remainingReq = parseInt(remainingRequestsStr, 10);
            if (!isNaN(remainingReq)) {
                this.tokenTracking[providerId].remainingRequests = remainingReq;

                // Fallback to tokens reset time if request reset time is not provided separately
                const resetStr = resetRequestsTimeStr || resetTokensTimeStr;
                if (resetStr) {
                    const resetVal = parseFloat(resetStr);
                    if (!isNaN(resetVal)) {
                        this.tokenTracking[providerId].requestsRefreshTime = Date.now() + (resetVal * 1000);
                    }
                }
            }
        }

        // Trigger persistence on header update too
        this.saveStats();
    }

    /**
     * Try to execute an LLM request with a specific provider
     * 
     * This method combines token management and LLM execution in one atomic operation,
     * allowing the router to try multiple providers without calling next() multiple times.
     * 
     * @param context - The pipeline context
     * @param providerId - The provider to use
     * @param modelId - The model to request
     * @returns The response if successful, null if failed
     * @throws Error if token limit exceeded or provider not found
     */
    async tryProvider(
        context: PipelineContext,
        providerId: string,
        modelId: string,
        timeoutMs?: number
    ): Promise<ChatResponse | null> {
        const whitelist = ['model', 'messages', 'temperature', 'top_p', 'n', 'stream', 'stop', 'max_tokens', 'presence_penalty', 'frequency_penalty', 'logit_bias', 'user', 'response_format'];
        if (providerId === 'gemini') {
            whitelist.push('google_search');
        }

        // Create a strictly sanitized request for this specific attempt
        const sanitizedRequest: any = {};
        for (const key of whitelist) {
            if ((context.request as any)[key] !== undefined) {
                sanitizedRequest[key] = (context.request as any)[key];
            }
        }

        // Privacy hardening: redact sensitive values before outbound provider call.
        if (sanitizedRequest.messages) {
            sanitizedRequest.messages = Sanitizer.sanitizeObject(sanitizedRequest.messages);
        }
        sanitizedRequest.user = sanitizedRequest.user ? Sanitizer.sanitize(String(sanitizedRequest.user)) : sanitizedRequest.user;

        // Ensure modelId is forced
        sanitizedRequest.model = modelId;

        if (context.estimatedTokens === undefined) {
            const promptTokens = this.calculateTokens(context.request.messages);
            context.estimatedTokens = promptTokens;
        }
        
        if (providerId === 'gemini') {
            sanitizedRequest.messages = sanitizedRequest.messages.map((m: any) => {
                if (m.role === 'system') {
                    const copy = { ...m, role: 'user' };
                    prependToMessageContent(copy, `[SYSTEM INSTRUCTION]: `);
                    return copy;
                }
                return m;
            });
        }


        const totalWithCompletion = context.estimatedTokens + (context.request.max_tokens || calculateModelWeightedMaxTokens(modelId));

        // 2. Check token limits (Permissive: Log warning but proceed)
        if (!this.hasEnoughTokens(providerId, totalWithCompletion)) {
            const tracker = this.tokenTracking[providerId];
            console.warn(
                `[LLMExecutor] Local token tracking suggests exhaustion for ${providerId}. ` +
                `Requires ${totalWithCompletion}, remaining ${tracker?.remainingTokens || 0}. ` +
                `Proceeding with best-effort attempt.`
            );
        }

        // 3. Deduct resources PROACTIVELY
        this.deductTokens(providerId, totalWithCompletion);

        // 4. Get provider and execute
        const registry = ProviderRegistry.getInstance();
        const provider = registry.getProvider(providerId);

        if (!provider) {
            throw new Error(`[LLMExecutor] Provider ${providerId} not found`);
        }

        let response: ChatResponse | null = null;
        let attempt = 0;
        const maxAttempts = (process.env.NODE_ENV === 'test' && !context.request.allowRetries) ? 1 : 3;
        let delayMs = 1500;

        while (attempt < maxAttempts) {
            attempt++;
            try {
                // Use sanitized request
                const requestWithTimeout = { 
                    ...sanitizedRequest, 
                    timeoutMs,
                    abortSignal: context.request.abortSignal 
                };
                response = await provider.chat(requestWithTimeout);
                break;
            } catch (err: any) {
                const errorMessage = err.message?.toLowerCase() || '';
                const isRateLimit = err.status === 429 ||
                    errorMessage.includes('rate_limit_exceeded') ||
                    errorMessage.includes('resource_exhausted') ||
                    errorMessage.includes('too many requests') ||
                    errorMessage.includes('quota exceeded') ||
                    errorMessage.includes('limit reached');

                if (isRateLimit && attempt < maxAttempts) {
                    console.warn(`[LLMExecutor] Rate limited on ${providerId} (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    delayMs *= 2;
                    continue;
                }

                if (isRateLimit) {
                    this.updateProviderTokenState(providerId, {
                        remainingTokens: 0,
                        remainingRequests: 0,
                        refreshTime: Date.now() + 60000,
                        requestsRefreshTime: Date.now() + 60000
                    });
                } else {
                    this.refundTokens(providerId, totalWithCompletion);
                }

                this.recordProviderFailure(providerId, err.status);
                throw err;
            }
        }

        // 7. Update token tracking from response headers (drift correction)
        if (response && response._headers) {
            this.updateTokenTracking(providerId, response._headers);

            // Bridge: propagate real remaining token quota into the pipeline context
            // so ContextManager can use it as a live compression target instead of
            // relying on a static model-window estimate.
            const tracker = this.tokenTracking[providerId];
            if (tracker?.remainingTokens !== undefined) {
                context.providerRemainingTokens = tracker.remainingTokens;
            }
        }

        // Record success for circuit breaker
        this.recordProviderSuccess(providerId);

        if (response) response._providerId = providerId;
        return response;
    }

    /**
     * Minimal standalone prompt execution (for subtasks/decomposition).
     */
    async prompt(
        messages: Message[],
        modelOverride: string = 'any',
        options: { 
            taskType?: string, 
            timeoutMs?: number,
            google_search?: boolean,
            sessionId?: string,
            agentic?: boolean
        } = {}
    ): Promise<ChatResponse> {
        const registry = ProviderRegistry.getInstance();
        const providers = registry.getAvailableProviders();

        if (providers.length === 0) {
            throw new Error('No providers available');
        }

        // TaskType-aware model prioritization for subtasks
        const taskModels: Record<string, string[]> = {
            coding: [
                'qwen/qwen3-coder-480b-a35b:free',
                'qwen/qwen3-coder-480b-a35b-instruct',
                'qwen/qwen3-coder:free',
                'deepseek/deepseek-r1',
                'deepseek-ai/DeepSeek-R1',
                'deepseek-ai/DeepSeek-V3',
                'gemini-3.1-flash-lite',
                'glm-4.7',
                'mistral-large-latest',
                'command-r-plus-08-2024'
            ],
            reasoning: [
                'deepseek/deepseek-r1',
                'deepseek-ai/DeepSeek-R1',
                'deepseek-ai/DeepSeek-V3',
                'gemini-3.1-flash-lite',
                'glm-4.7',
                'llama-3.3-70b-versatile'
            ],
            chat: [
                'deepseek-ai/DeepSeek-V3',
                'gemini-3.1-flash-lite',
                'glm-4.7',
                'llama-3.3-70b-versatile',
                'command-r-plus-08-2024'
            ]
        };

        let targetModels = [modelOverride];
        if (modelOverride === 'any') {
            const taskKey = options.taskType ? options.taskType.toLowerCase() : 'chat';
            targetModels = taskModels[taskKey] || taskModels.chat;
            
            // If the prompt contains an image, prioritize vision-capable models (e.g. Gemini 3.1, Gemma 4)
            const hasImage = messages.some(m => 
                Array.isArray(m.content) && m.content.some((item: any) => item.type === 'image_url')
            );
            if (hasImage) {
                const visionModels = ['gemini-3.1-flash-lite', 'google/gemma-4-31b-it:free'];
                targetModels = [
                    ...visionModels,
                    ...targetModels.filter(m => !visionModels.includes(m))
                ];
            }
            // If google search is enabled, prioritize gemini
            else if (options.google_search) {
                targetModels = ['gemini-3.1-flash-lite', ...targetModels.filter(m => m !== 'gemini-3.1-flash-lite')];
            }
        }

        // Pre-calculate scores once for efficiency
        const scoredProviders = providers.map(p => {
            let score = this.getTokenScore(p.id);
            if (p.consecutiveFailures > 0) score *= 0.3;
            if (this.isProviderCircuitOpen(p.id)) score = -1;
            return { provider: p, score };
        }).sort((a, b) => b.score - a.score);

        const context: PipelineContext = {
            request: {
                model: modelOverride,
                messages,
                google_search: options.google_search,
                sessionId: options.sessionId,
                agentic: options.agentic
            },
            taskType: options.taskType as any || TaskType.Chat
        };

        // Two-pass strategy:
        // Pass 1: Try only healthy providers (score >= 0)
        // Pass 2: Fall back to unhealthy/cooling-down providers (score < 0) on a best-effort basis
        const passes = [true, false];
        for (const healthyOnly of passes) {
            for (const modelId of targetModels) {
                for (const { provider: p, score } of scoredProviders) {
                    if (healthyOnly && score < 0) continue;

                    // Google Search is a Gemini-exclusive feature in this architecture
                    if (options.google_search && p.id !== 'gemini') continue;
                    
                    // Only use this provider if it supports the specific model we want to run
                    const supportsModel = p.models.some((m: any) => m.id === modelId);
                    if (modelOverride === 'any' ? supportsModel : p.models.some((m: any) => m.id === modelOverride)) {
                        try {
                            const actualModel = modelOverride === 'any' ? modelId : modelOverride;
                            const res = await this.tryProvider(context, p.id, actualModel, options.timeoutMs || 15000);
                            if (res) {
                                this.recordProviderSuccess(p.id);
                                return res;
                            }
                        } catch (err: any) {
                            this.recordProviderFailure(p.id, err.status || 500);
                            continue;
                        }
                    }
                }
            }

            // Ultimate fallback within the current pass (if modelOverride is 'any')
            if (modelOverride === 'any') {
                for (const { provider: p, score } of scoredProviders) {
                    if (healthyOnly && score < 0) continue;
                    if (options.google_search && p.id !== 'gemini') continue;

                    const fallbackModel = p.models[0]?.id;
                    if (fallbackModel) {
                        try {
                            console.error(`[LLMExecutor] Routing fallback (healthyOnly=${healthyOnly}) to ${p.id}/${fallbackModel}`);
                            const res = await this.tryProvider(context, p.id, fallbackModel, options.timeoutMs || 15000);
                            if (res) {
                                this.recordProviderSuccess(p.id);
                                return res;
                            }
                        } catch (err: any) {
                            this.recordProviderFailure(p.id, err.status || 500);
                            continue;
                        }
                    }
                }
            }
        }

        throw new Error(`Failed to execute prompt with any provider.`);
    }

    /**
     * Get current token tracking state
     */
    getTokenState(): Record<string, TokenTrackingInfo> {
        return this.tokenTracking;
    }

    /**
     * Set token tracking state (for sharing state with TokenManagerMiddleware)
     */
    setTokenState(state: Record<string, TokenTrackingInfo>): void {
        this.tokenTracking = state;
    }

    /**
     * Clear token tracking state
     */
    flush(): void {
        this.tokenTracking = {};
        this.providerCircuits.clear();
    }
}
