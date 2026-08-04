import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';
import { CyberToolsRegistry } from '../src/utils/CyberToolsRegistry.js';

describe('CyberToolsRegistry (UserProfile Path & File-Locking)', () => {
    const registryPath = CyberToolsRegistry.getRegistryFilePath();

    it('returns the userprofile directory path ~/.free-llm-mcp/cyber-tools-registry.json', () => {
        const expectedSubpath = path.join('.free-llm-mcp', 'cyber-tools-registry.json');
        expect(registryPath).toContain(expectedSubpath);
        expect(registryPath).toContain(os.homedir());
    });

    it('loads default cyber tools and creates userprofile registry file', async () => {
        const toolNames = await CyberToolsRegistry.getToolNames();
        expect(toolNames).toContain('sqlmap');
        expect(toolNames).toContain('nmap');
        expect(toolNames).toContain('ffuf');

        const fileExists = await fs.stat(registryPath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
    });

    it('registers a new cyber tool dynamically with file-lock synchronization', async () => {
        const customTool = 'test-tool-' + Date.now();
        const customUrl = 'https://github.com/example/' + customTool;

        const updatedRegistry = await CyberToolsRegistry.registerTool(customTool, customUrl);
        expect(updatedRegistry[customTool]).toBe(customUrl);

        const fetchedUrl = await CyberToolsRegistry.getToolGithubUrl(customTool);
        expect(fetchedUrl).toBe(customUrl);
    });
});
