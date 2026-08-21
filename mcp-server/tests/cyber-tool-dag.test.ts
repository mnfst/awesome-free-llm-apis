import { cyberTool } from '../src/tools/cyber-tool.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POSTBUILD_CYBER_PATH = path.resolve(__dirname, '../../external/cyber-tools-index');

describe('cyber_tool dag_reverse mode', () => {
    const sessionId = `test-dag-session-${Date.now()}`;
    let cybersecPath = POSTBUILD_CYBER_PATH;
    let tempDirCreated = false;

    beforeAll(async () => {
        if (!existsSync(path.join(POSTBUILD_CYBER_PATH, 'tools_config.json'))) {
            cybersecPath = path.join(os.tmpdir(), `cybersec-test-fixture-${Date.now()}`);
            await fs.mkdir(cybersecPath, { recursive: true });
            tempDirCreated = true;

            const modules = [
                'networking', 'recon', 'sqli', 'xss', 'csrf', 'rce', 'lfi', 'rfi',
                'crypto', 'forensics', 'stego', 'reversing', 'pwn', 'fuzzing',
                'osint', 'cloud', 'wireless', 'auth', 'mobile', 'api'
            ];
            const sampleTools = modules.map(m => ({
                name: `${m}-tool`,
                method: 'EXEC',
                url: `https://example.com/api/${m}`,
                module: m
            }));
            await fs.writeFile(path.join(cybersecPath, 'tools_config.json'), JSON.stringify(sampleTools, null, 2), 'utf-8');
        }
    });

    afterAll(async () => {
        if (tempDirCreated && existsSync(cybersecPath)) {
            try {
                await fs.rm(cybersecPath, { recursive: true, force: true });
            } catch {}
        }
    });

    it('learn in dag_reverse mode initializes DAG manifest', async () => {
        const result = await cyberTool({
            action: 'learn',
            mode: 'dag_reverse',
            toolName: 'cybersec-toolkit',
            repoPath: cybersecPath,
            sessionId,
            sliceSize: 50
        });

        expect(result.success).toBe(true);
        expect(result.totalNodes).toBeGreaterThanOrEqual(18);
        expect(result.nextNodeId).toBeTruthy();
        expect(result.progressKey).toMatch(/dag_manifest/);
    }, 15000);

    it('coach in dag_reverse mode with statusOnly returns status', async () => {
        const result = await cyberTool({
            action: 'coach',
            mode: 'dag_reverse',
            statusOnly: true,
            sessionId
        });

        expect(result.success).toBe(true);
        expect(result.pctComplete).toBeDefined();
        expect(result.totalNodes).toBeGreaterThanOrEqual(18);
    }, 10000);

    it('coach in dag_reverse mode scans node and writes wiki', async () => {
        const result = await cyberTool({
            action: 'coach',
            mode: 'dag_reverse',
            toolName: 'cybersec-toolkit',
            nodeId: 'cybersec-toolkit/networking',
            sessionId
        });

        expect(result.success).toBe(true);
        expect(result.nodeId).toBe('cybersec-toolkit/networking');
        expect(result.status).toBe('done');
        expect(result.wikiPageTitle).toBe('cybersec-toolkit/networking');
        expect(result.itemsProcessed).toBeGreaterThan(0);
    }, 30000);
});
