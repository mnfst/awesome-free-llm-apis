/**
 * Strict-mode result contract for browser_tool. Replaces the old ScrapeResult
 * pattern where a failed LLM parse silently produced plausible-looking records
 * and `success: true` with zero records was indistinguishable from a real empty page.
 */
export type ExtractionStatus = 'ok' | 'partial' | 'failed';

export interface BrowserToolError {
    stage: string;
    code: string;
    message: string;
    recoverable: boolean;
}

export interface FieldProvenance {
    source: 'api' | 'dom' | 'llm' | 'derived';
    evidence?: string;
    url?: string;
}

export interface BrowserActionResult<T = any> {
    success: boolean;
    status: ExtractionStatus;
    action: string;
    sessionId: string;
    url?: string;
    data: T | null;
    confidence: number;
    provenance?: Record<string, FieldProvenance>;
    recordCount: number;
    totalAccumulatedRecords?: number;
    jsonPath?: string;
    csvPath?: string;
    checkpointPath?: string;
    screenshotPath?: string;
    errors: BrowserToolError[];
    warnings: string[];
    usedPersistedScript: boolean;
    usedSiteMemory: boolean;
}

export function okResult<T>(partial: Partial<BrowserActionResult<T>> & { action: string; sessionId: string }): BrowserActionResult<T> {
    return {
        success: true,
        status: 'ok',
        data: null,
        confidence: 1,
        recordCount: 0,
        errors: [],
        warnings: [],
        usedPersistedScript: false,
        usedSiteMemory: false,
        ...partial,
    };
}

export function failResult<T>(partial: Partial<BrowserActionResult<T>> & { action: string; sessionId: string; errors: BrowserToolError[] }): BrowserActionResult<T> {
    return {
        success: false,
        status: 'failed',
        data: null,
        confidence: 0,
        recordCount: 0,
        warnings: [],
        usedPersistedScript: false,
        usedSiteMemory: false,
        ...partial,
    };
}

export function engineUnavailableError(message: string): BrowserToolError {
    return {
        stage: 'session',
        code: 'BROWSER_ENGINE_UNAVAILABLE',
        message,
        recoverable: true,
    };
}
