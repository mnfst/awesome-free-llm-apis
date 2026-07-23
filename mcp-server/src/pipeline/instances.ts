import { TextRouterMiddleware } from './middlewares/TextRouterMiddleware.js';
import { ImageRouterMiddleware } from './middlewares/ImageRouterMiddleware.js';
import { AgenticMiddleware } from './middlewares/AgenticMiddleware.js';
import { WorkspaceContextMiddleware } from './middlewares/WorkspaceContextMiddleware.js';
import { ResponseCacheMiddleware } from './middlewares/ResponseCacheMiddleware.js';
import { StructuralMarkdownMiddleware } from './middlewares/StructuralMiddleware.js';
import { LLMExecutor } from '../utils/LLMExecutor.js';

/**
 * Pipeline Instance Registry (Hardened)
 * 
 * Provides lazy-loaded singleton instances of all middlewares to be shared across the application.
 * This pattern prevents ReferenceErrors during module initialization caused by circular 
 * dependencies between middlewares (e.g., AgenticMiddleware needing sharedRouter 
 * and sharedRouter needing the full pipeline definition).
 */

let _structuralMarkdownMiddleware: StructuralMarkdownMiddleware | null = null;
let _sharedResponseCache: ResponseCacheMiddleware | null = null;
let _workspaceContextMiddleware: WorkspaceContextMiddleware | null = null;
let _sharedRouter: TextRouterMiddleware | null = null;
let _sharedImageRouter: ImageRouterMiddleware | null = null;
let _agenticMiddleware: AgenticMiddleware | null = null;
let _sharedExecutor: LLMExecutor | null = null;

/**
 * Gets the singleton LLMExecutor shared by every middleware that can make a live
 * LLM call (TextRouterMiddleware, AgenticMiddleware, ImageRouterMiddleware).
 * Each of those middlewares used to construct its own private `new LLMExecutor()`
 * when none was passed in, which meant request/token counters accumulated in
 * whichever instance actually handled the call — but the dashboard's
 * /api/provider-stats and /api/token-stats routes only ever read
 * getSharedRouter().getExecutor() (TextRouterMiddleware's instance). Since agentic
 * calls (the common case once a workspace is set) are handled entirely by
 * AgenticMiddleware's own separate executor, its usage was invisible to the
 * dashboard — showing 0 requests/tokens for every provider regardless of real
 * traffic. Sharing one executor instance across all three fixes that.
 */
export function getSharedExecutor(): LLMExecutor {
    if (!_sharedExecutor) {
        _sharedExecutor = new LLMExecutor();
    }
    return _sharedExecutor;
}

/**
 * Gets the singleton instance of StructuralMarkdownMiddleware.
 */
export function getStructuralMarkdownMiddleware(): StructuralMarkdownMiddleware {
    if (!_structuralMarkdownMiddleware) {
        _structuralMarkdownMiddleware = new StructuralMarkdownMiddleware();
    }
    return _structuralMarkdownMiddleware;
}

/**
 * Gets the singleton instance of ResponseCacheMiddleware.
 */
export function getSharedResponseCache(): ResponseCacheMiddleware {
    if (!_sharedResponseCache) {
        _sharedResponseCache = new ResponseCacheMiddleware();
    }
    return _sharedResponseCache;
}

/**
 * Gets the singleton instance of WorkspaceContextMiddleware.
 */
export function getWorkspaceContextMiddleware(): WorkspaceContextMiddleware {
    if (!_workspaceContextMiddleware) {
        _workspaceContextMiddleware = new WorkspaceContextMiddleware();
    }
    return _workspaceContextMiddleware;
}

/**
 * Gets the singleton instance of IntelligentRouterMiddleware.
 */
export function getSharedRouter(): TextRouterMiddleware {
    if (!_sharedRouter) {
        _sharedRouter = new TextRouterMiddleware(getSharedExecutor());
    }
    return _sharedRouter;
}

/**
 * Gets the singleton instance of ImageRouterMiddleware.
 */
export function getSharedImageRouter(): ImageRouterMiddleware {
    if (!_sharedImageRouter) {
        _sharedImageRouter = new ImageRouterMiddleware(getSharedExecutor());
    }
    return _sharedImageRouter;
}

/**
 * Gets the singleton instance of AgenticMiddleware.
 */
export function getAgenticMiddleware(): AgenticMiddleware {
    if (!_agenticMiddleware) {
        _agenticMiddleware = new AgenticMiddleware(getSharedExecutor());
    }
    return _agenticMiddleware;
}

/**
 * Reset all singleton instance references.
 * Intended for test isolation teardown only.
 */
export function resetAllInstances(): void {
    _structuralMarkdownMiddleware = null;
    _sharedResponseCache = null;
    _workspaceContextMiddleware = null;
    _sharedRouter = null;
    _sharedImageRouter = null;
    _agenticMiddleware = null;
    _sharedExecutor = null;
}

// Deprecated direct exports have been removed. All callers should use getter functions.



