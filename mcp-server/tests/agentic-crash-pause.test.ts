import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { AgenticMiddleware } from '../src/pipeline/middlewares/AgenticMiddleware.js';
import type { PipelineContext } from '../src/pipeline/middleware.js';

describe('AgenticMiddleware - crashed subtask becomes a recoverable HITL pause', () => {
    const sessionId = `test-crash-pause-${Date.now()}`;
    const projectDir = path.join(os.homedir(), '.free-llm-mcp', 'projects', sessionId);

    afterEach(async () => {
        vi.restoreAllMocks();
        try {
            await fs.remove(projectDir);
        } catch {}
    });

    it('turns an uncaught executor.prompt() exception into a paused, continue-able state instead of an uncaught throw', async () => {
        const { LLMExecutor } = await import('../src/utils/LLMExecutor.js');
        vi.spyOn(LLMExecutor.prototype, 'prompt').mockRejectedValue(new Error('simulated provider crash'));

        const middleware = new AgenticMiddleware();
        const context: PipelineContext = {
            sessionId,
            agentic: true,
            request: {
                model: 'any',
                agentic: true,
                messages: [{ role: 'user', content: 'fix the bug in auth.ts' }],
            },
        } as any;

        // Must not throw uncaught — the crash should be caught and surfaced as a normal response.
        await expect(middleware.execute(context, async () => {})).resolves.not.toThrow();

        const content = context.response?.choices?.[0]?.message?.content as string;
        expect(content).toBeTruthy();
        expect(content).toContain('Subtask Execution Failed');
        expect(content).toMatch(/continue [A-Z0-9]{6}/);

        // A second call against the same session must show the pause banner (proving the
        // paused/promptId state actually stuck) instead of silently re-attempting and
        // re-crashing on the same stale subtask with no visible signal.
        const secondContext: PipelineContext = {
            sessionId,
            agentic: true,
            request: {
                model: 'any',
                agentic: true,
                messages: [{ role: 'user', content: 'anything else' }],
            },
        } as any;
        await middleware.execute(secondContext, async () => {});
        const secondContent = secondContext.response?.choices?.[0]?.message?.content as string;
        expect(secondContent).toContain('Pipeline is currently Paused');
        expect(secondContent).toMatch(/continue [A-Z0-9]{6}/);
    });
});
