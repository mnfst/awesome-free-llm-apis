import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WikiMemory } from '../src/memory/wiki.js';
import { GLOBAL_CYBER_WIKI_NS, CYBER_TOOL_NAMES } from '../src/utils/GithubRepoScanner.js';
import fs from 'fs/promises';
import path from 'path';

describe('Cyber tools global wiki', () => {
    const testDir = path.join(process.cwd(), 'temp_test_cyber_wiki_ws');

    beforeEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('persists a discovered tool under the global namespace, independent of any per-workspace hash', async () => {
        const globalWiki = new WikiMemory(GLOBAL_CYBER_WIKI_NS, testDir);
        await globalWiki.write('nmap/nmap', 'Network exploration tool and security scanner.', ['cyber', 'github-tool', 'nmap'], ['https://github.com/nmap/nmap']);

        // A different "workspace" wiki instance pointed at the same namespace sees the same page —
        // simulating two different project workspaces sharing cyber-tool knowledge.
        const sameNamespaceFromAnotherWorkspace = new WikiMemory(GLOBAL_CYBER_WIKI_NS, testDir);
        const page = await sameNamespaceFromAnotherWorkspace.read('nmap/nmap');
        expect(page).not.toBeNull();
        expect(page?.tags).toContain('cyber');
    });

    it('reinforce() raises confidence on repeated successful tool use', async () => {
        const wiki = new WikiMemory(GLOBAL_CYBER_WIKI_NS, testDir);
        await wiki.write('sqlmap/sqlmap', 'Automatic SQL injection tool.', ['cyber', 'github-tool']);

        const before = await wiki.read('sqlmap/sqlmap');
        const after = await wiki.reinforce('sqlmap/sqlmap');

        expect(after!.confidence).toBeGreaterThan(before!.confidence);
    });

    it('recordFailure() lowers confidence and records the failure reason', async () => {
        const wiki = new WikiMemory(GLOBAL_CYBER_WIKI_NS, testDir);
        await wiki.write('hydra/hydra', 'Parallelized login cracker.', ['cyber', 'github-tool']);

        const before = await wiki.read('hydra/hydra');
        const after = await wiki.recordFailure('hydra/hydra', 'Command exited non-zero against the target.');

        expect(after!.confidence).toBeLessThan(before!.confidence);
        expect(after!.content).toContain('Command exited non-zero against the target.');
    });

    it('CYBER_TOOL_NAMES includes common security binaries used to gate discovery/reinforcement', () => {
        expect(CYBER_TOOL_NAMES).toContain('nmap');
        expect(CYBER_TOOL_NAMES).toContain('sqlmap');
        expect(CYBER_TOOL_NAMES).toContain('hydra');
    });
});
