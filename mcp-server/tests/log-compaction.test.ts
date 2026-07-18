import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { ContextGatherer } from '../src/pipeline/middlewares/context-gatherer.js';
import fs from 'fs/promises';

describe('Context Gatherer Log & JSON Compaction Tests', () => {
    const mockWorkspaceRoot = path.resolve(__dirname, 'mock-compaction-workspace');
    let originalThreshold: string | undefined;

    // Relative paths to the files inside the tests/context/ subdirectory
    const logSourcePath = path.resolve(__dirname, 'context', 'test-log.log');
    const jsonSourcePath = path.resolve(__dirname, 'context', 'test-json.json');
    const n8nSourcePath = path.resolve(__dirname, 'context', 'daily-nday-pipeline.import.json');

    beforeEach(async () => {
        originalThreshold = process.env.LOG_COMPACTION_THRESHOLD;
        // Set lower threshold for high variance testing
        process.env.LOG_COMPACTION_THRESHOLD = '0.50';
        await fs.mkdir(mockWorkspaceRoot, { recursive: true });
    });

    afterEach(async () => {
        process.env.LOG_COMPACTION_THRESHOLD = originalThreshold;
        await fs.rm(mockWorkspaceRoot, { recursive: true, force: true });
    });

    it('should semantically compact intermediate lines of a large .log file, maintaining head and tail of matches', async () => {
        const logFilePath = path.join(mockWorkspaceRoot, 'test-execution.log');
        // Programmatically copy from tests/context/ subdirectory first
        await fs.copyFile(logSourcePath, logFilePath);

        const results = await ContextGatherer.gatherContext({
            workspaceRoot: mockWorkspaceRoot,
            query: 'test-execution.log override log',
            keywords: ['test-execution.log', 'Hedge'],
        });

        // 1. Verify file marker exists
        expect(results.some(r => r.includes('FILE: test-execution.log'))).toBe(true);

        // 2. Verify head matches are present
        expect(results.some(r => r.includes('Initializing Workspace Scanner'))).toBe(true);

        // 3. Verify middle lines are compacted (collapsed indicator exists)
        expect(results.some(r => r.includes('similar lines collapsed via semantic matching'))).toBe(true);

        // 4. Verify tail matches are present (verifying DB Query is matched as the tail matching element in the output scope)
        expect(results.some(r => r.includes('DB Query'))).toBe(true);
    });

    it('should semantically compact intermediate elements of a large .json array', async () => {
        const jsonFilePath = path.join(mockWorkspaceRoot, 'test-metrics.json');
        // Programmatically copy from tests/context/ subdirectory first
        await fs.copyFile(jsonSourcePath, jsonFilePath);

        const results = await ContextGatherer.gatherContext({
            workspaceRoot: mockWorkspaceRoot,
            query: 'test-metrics.json override json',
            keywords: ['test-metrics.json', 'session-metric', 'SystemConfiguration'],
        });

        expect(results.some(r => r.includes('FILE: test-metrics.json'))).toBe(true);
        
        // Verify head matches
        expect(results.some(r => r.includes('SystemConfiguration'))).toBe(true);
        expect(results.some(r => r.includes('serverPort'))).toBe(true);
        
        // Verify middle collapse
        expect(results.some(r => r.includes('similar lines collapsed via semantic matching'))).toBe(true);
        
        // Verify tail matches (metrics verification summary)
        expect(results.some(r => r.includes('Metrics verification completed'))).toBe(true);
    });

    it('should semantically compact repeating nodes/connections in an n8n workflow import JSON', async () => {
        const n8nFilePath = path.join(mockWorkspaceRoot, 'workflow.json');
        // Copy the real n8n workflow import JSON to the mock workspace first
        await fs.copyFile(n8nSourcePath, n8nFilePath);

        const results = await ContextGatherer.gatherContext({
            workspaceRoot: mockWorkspaceRoot,
            query: 'workflow.json override httpRequest',
            keywords: ['workflow.json', 'httpRequest'],
        });

        // Verify file is scanned
        expect(results.some(r => r.includes('FILE: workflow.json'))).toBe(true);

        // Verify that similar connection blocks are collapsed
        expect(results.some(r => r.includes('similar lines collapsed via semantic matching'))).toBe(true);
    });

    it('should NOT compact or collapse code snippets like jsCode or pythonCode within n8n json files', async () => {
        const n8nFilePath = path.join(mockWorkspaceRoot, 'workflow.json');
        await fs.copyFile(n8nSourcePath, n8nFilePath);

        const results = await ContextGatherer.gatherContext({
            workspaceRoot: mockWorkspaceRoot,
            query: 'workflow.json override jsCode',
            keywords: ['workflow.json', 'jsCode'],
        });

        // Verify file is scanned
        expect(results.some(r => r.includes('FILE: workflow.json'))).toBe(true);

        // Verify that the code content block is preserved and NOT collapsed
        expect(results.some(r => r.includes('jsCode'))).toBe(true);
        expect(results.some(r => r.includes('similar lines collapsed'))).toBe(false);
    });
});
