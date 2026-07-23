import { memoryManager } from '../memory/index.js';
import { WorkspaceScanner } from '../cache/workspace.js';
import { ContextManager } from '../utils/ContextManager.js';

export interface ManageMemoryInput {
    action: 'search' | 'list' | 'stats' | 'clear' | 'wiki_search' | 'wiki_write' | 'wiki_list' | 'wiki_read';
    workspace_root?: string;
    query?: string;
    limit?: number;
    title?: string;
    content?: string;
    tags?: string[];
    links?: string[];
    persona?: string;
    /** Wiki namespace override, e.g. 'global-cyber-tools'. Defaults to the workspace hash. */
    namespace?: string;
}

const workspaceScanner = new WorkspaceScanner(process.cwd());

export async function manageMemory(input: ManageMemoryInput) {
    const { action, workspace_root: workspaceRoot, query, limit = 10, title, content, tags, links, persona, namespace } = input;
    const wsHash = await workspaceScanner.getWorkspaceHash(workspaceRoot);
    switch (action) {
        case 'wiki_search': {
            const wiki = memoryManager.getWiki(namespace || wsHash, workspaceRoot);
            const results = await wiki.search(query || '', persona);
            return { results: results.slice(0, limit) };
        }
        case 'wiki_write': {
            if (!title || !content) {
                throw new Error('wiki_write requires `title` and `content`.');
            }
            const wiki = memoryManager.getWiki(namespace || wsHash, workspaceRoot);
            const page = await wiki.write(title, content, tags || [], links || []);
            return { success: true, page };
        }
        case 'wiki_list': {
            const wiki = memoryManager.getWiki(namespace || wsHash, workspaceRoot);
            return { pages: await wiki.list() };
        }
        case 'wiki_read': {
            if (!title) {
                throw new Error('wiki_read requires `title`.');
            }
            const wiki = memoryManager.getWiki(namespace || wsHash, workspaceRoot);
            const page = await wiki.read(title);
            return { page };
        }
        case 'stats':
            return await memoryManager.getCompressionStats();
        case 'list':
            return { workspace: workspaceRoot || 'default', hash: wsHash };
        case 'clear':
            await memoryManager.clear(wsHash);
            return { success: true, message: `Cleared memory for workspace ${wsHash}` };
        case 'search': {
            const contextManager = new ContextManager();
            const allResults = await memoryManager.search(wsHash, query);
            // Apply hard count limit
            let results = allResults.slice(0, limit);

            // Apply token limit to prevent pipeline overload
            const MAX_MEMORY_TOKENS = 8000;
            let currentTokens = contextManager.countStringTokens(JSON.stringify(results));

            if (currentTokens > MAX_MEMORY_TOKENS) {
                while (results.length > 1 && currentTokens > MAX_MEMORY_TOKENS) {
                    results.pop(); // Remove largest or last item
                    currentTokens = contextManager.countStringTokens(JSON.stringify(results));
                }
                return {
                    results,
                    meta: {
                        total_found: allResults.length,
                        note: `Truncated to ${results.length} results (${currentTokens} tokens) to prevent context overflow.`
                    }
                };
            }

            return {
                results,
                meta: { total_found: allResults.length }
            };
        }
        default:
            throw new Error(`Unsupported action: ${action}`);
    }
}
