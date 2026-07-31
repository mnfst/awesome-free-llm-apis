import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

// Stub the LLM call so tests don't hit real providers — cyberTool dynamically imports
// './use-free-llm.js' at call time, so mocking the module is sufficient.
vi.mock('../src/tools/use-free-llm.js', () => ({
    useFreeLLM: vi.fn(async ({ messages }: any) => {
        const lastUser = messages[messages.length - 1]?.content || '';
        const isCoach = /Diagnose what happened/.test(lastUser);
        const text = isCoach
            ? 'Run `nmap -sV -p- 10.0.0.1` next to fully enumerate services. Expected output: open port list with versions.'
            : '1. Run `nmap -sC -sV target` — explanation: default scripts + version detection. Expected output: open ports.';
        return { choices: [{ message: { content: text } }] };
    })
}));

import { cyberTool } from '../src/tools/cyber-tool.js';
import { WikiMemory } from '../src/memory/wiki.js';

describe('cyber_tool educational coach + CTF decision graph + tool memory', () => {
    const sessionId = `test-session-${Date.now()}`;
    const toolName = `test-tool-${Date.now()}`;
    const wikiDir = path.join(os.homedir(), '.free-llm-mcp', 'wiki', 'cyber-tools');

    afterEach(async () => {
        // Clean up any pages this test created in the real cyber-tools wiki namespace.
        const titles = [
            `progress_${sessionId}`,
            `ctf-graph_${sessionId}`,
            `${toolName}_run_suggestions`
        ];
        for (const t of titles) {
            await fs.rm(path.join(wikiDir, `${t.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`), { force: true }).catch(() => {});
        }
    });

    it('learn: generates a walkthrough, seeds progress + decision graph', async () => {
        const result = await cyberTool({
            action: 'learn',
            goal: 'enumerate services on a lab host with nmap',
            sessionId
        } as any);

        expect(result.success).toBe(true);
        expect(result.walkthrough).toContain('nmap');
        expect(result.progressKey).toBe(`progress/${sessionId}`);
        expect(result.graphKey).toBe(`ctf-graph/${sessionId}`);

        const wiki = new WikiMemory('cyber-tools');
        const progressPage = await wiki.read(`progress/${sessionId}`);
        expect(progressPage).not.toBeNull();
        const progress = JSON.parse(progressPage!.content);
        expect(progress.goal).toBe('enumerate services on a lab host with nmap');

        const graphPage = await wiki.read(`ctf-graph/${sessionId}`);
        expect(graphPage).not.toBeNull();
        const graph = JSON.parse(graphPage!.content);
        expect(graph.nodes.some((n: any) => n[0] === 'root')).toBe(true);
    });

    it('coach: injects saved graph/progress, returns next step, extends the graph and tool memory', async () => {
        await cyberTool({ action: 'learn', goal: 'enumerate services', sessionId } as any);

        const result = await cyberTool({
            action: 'coach',
            sessionId,
            toolName,
            observation: 'nmap showed port 80 open'
        } as any);

        expect(result.success).toBe(true);
        expect(result.nextStep).toContain('nmap');

        const wiki = new WikiMemory('cyber-tools');
        const graphPage = await wiki.read(`ctf-graph/${sessionId}`);
        const graph = JSON.parse(graphPage!.content);
        expect(graph.nodes.length).toBeGreaterThan(1);
        expect(graph.edges.length).toBeGreaterThan(0);

        const toolMemory = await wiki.read(`${toolName}/run_suggestions`);
        expect(toolMemory).not.toBeNull();
        expect(toolMemory!.content).toContain('nmap');
    });

    it('save_graph / load_graph round-trip a decision graph node', async () => {
        await cyberTool({
            action: 'save_graph',
            sessionId,
            graphNode: { id: 'root', label: 'find the flag', type: 'goal' }
        } as any);
        const withChild = await cyberTool({
            action: 'save_graph',
            sessionId,
            graphNode: { id: 'hyp-1', label: 'try SQLi on login form', type: 'hypothesis', from: 'root' }
        } as any);
        expect(withChild.totalNodes).toBe(2);
        expect(withChild.totalEdges).toBe(1);

        const loaded = await cyberTool({ action: 'load_graph', sessionId } as any);
        expect(loaded.success).toBe(true);
        expect(loaded.nodes.map((n: any) => n.id)).toEqual(expect.arrayContaining(['root', 'hyp-1']));
        expect(loaded.edges[0]).toMatchObject({ source: 'root', target: 'hyp-1' });
    });

    it('tool_memory write then read preserves per-tool run suggestions across calls', async () => {
        const written = await cyberTool({
            action: 'tool_memory',
            memoryOp: 'write',
            toolName,
            note: '-sV -p- for a full service scan on lab targets'
        } as any);
        expect(written.success).toBe(true);

        const read = await cyberTool({ action: 'tool_memory', memoryOp: 'read', toolName } as any);
        expect(read.success).toBe(true);
        expect(read.runSuggestions.content).toContain('-sV -p-');
    });
});
