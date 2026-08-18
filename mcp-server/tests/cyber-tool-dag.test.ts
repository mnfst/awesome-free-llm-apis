import { cyberTool } from '../src/tools/cyber-tool.js';
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CYBERSEC_PATH = path.resolve(__dirname, 'context', 'cybersec-toolkit');

describe('cyber_tool dag_reverse mode', () => {
    const sessionId = `test-dag-session-${Date.now()}`;

    it('learn in dag_reverse mode initializes DAG manifest', async () => {
        const result = await cyberTool({
            action: 'learn',
            mode: 'dag_reverse',
            toolName: 'cybersec-toolkit',
            repoPath: CYBERSEC_PATH,
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
