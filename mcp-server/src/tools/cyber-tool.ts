import { CyberToolsRegistry } from '../utils/CyberToolsRegistry.js';
import { GlobalWikiManager } from '../utils/GlobalWikiManager.js';
import { WikiMemory } from '../memory/wiki.js';
import { logToolCall } from '../utils/ChatLogger.js';
import path from 'node:path';

export interface CyberToolInput {
    action: 'list_tools' | 'get_tool' | 'register_tool' | 'wiki_lookup';
    toolName?: string;
    githubUrl?: string;
    sessionId?: string;
}

export async function cyberTool(input: CyberToolInput) {
    const start = Date.now();
    const action = input.action || 'list_tools';
    const sessionId = input.sessionId || 'cyber_tools_session';
    let result: any;
    let isError = false;

    try {
        if (action === 'list_tools') {
            const tools = await CyberToolsRegistry.loadRegistry();
            result = {
                success: true,
                totalTools: Object.keys(tools).length,
                registryPath: CyberToolsRegistry.getRegistryFilePath(),
                tools
            };
        } else if (action === 'get_tool') {
            if (!input.toolName) throw new Error('toolName parameter required for get_tool action');
            const url = await CyberToolsRegistry.getToolGithubUrl(input.toolName);
            result = {
                success: !!url,
                toolName: input.toolName,
                githubUrl: url || null
            };
        } else if (action === 'register_tool') {
            if (!input.toolName || !input.githubUrl) throw new Error('toolName and githubUrl required for register_tool');
            const updated = await CyberToolsRegistry.registerTool(input.toolName, input.githubUrl);
            result = {
                success: true,
                registeredTool: input.toolName,
                githubUrl: input.githubUrl,
                registry: updated
            };
        } else if (action === 'wiki_lookup') {
            if (!input.toolName) throw new Error('toolName required for wiki_lookup action');
            const wiki = new WikiMemory('cyber-tools');
            const page = await wiki.read(`${input.toolName}/flags_and_troubleshooting`);
            result = {
                success: !!page,
                toolName: input.toolName,
                wikiPage: page || null
            };
        } else {
            throw new Error(`Unsupported cyber_tool action: ${action}`);
        }
    } catch (err: any) {
        isError = true;
        result = { error: String(err?.message || err) };
        throw err;
    } finally {
        // Phase 3 Chat Logger Integration — Log each action step into chat-logs.json
        await logToolCall(sessionId, `cyber_tool:${action}`, input, result, Date.now() - start, isError).catch(() => {});
    }

    return result;
}
