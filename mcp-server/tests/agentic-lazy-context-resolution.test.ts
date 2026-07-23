import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { AgenticMiddleware } from '../src/pipeline/middlewares/AgenticMiddleware.js';
import { getMessageContent } from '../src/utils/MessageUtils.js';
import type { PipelineContext } from '../src/pipeline/middleware.js';

describe('AgenticMiddleware - lazy PDF/file context resolution (Phase 2)', () => {
    const sessionId = `test-lazy-ctx-${Date.now()}`;
    const projectDir = path.join(os.homedir(), '.free-llm-mcp', 'projects', sessionId);

    afterEach(async () => {
        vi.restoreAllMocks();
        try {
            await fs.remove(projectDir);
        } catch {}
    });

    it('queues a short placeholder (not raw PDF content) but resolves it back to full content in the outbound LLM prompt', async () => {
        const { LLMExecutor } = await import('../src/utils/LLMExecutor.js');
        let capturedMessages: any[] | undefined;
        vi.spyOn(LLMExecutor.prototype, 'prompt').mockImplementation(async (messages: any[]) => {
            capturedMessages = messages;
            return {
                id: 'mock-id',
                object: 'chat.completion',
                created: Date.now(),
                model: 'mock-model',
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content: 'Done implementing the feature.' },
                    finish_reason: 'stop',
                }],
            } as any;
        });

        const middleware = new AgenticMiddleware();
        const context: PipelineContext = {
            sessionId,
            agentic: true,
            request: {
                model: 'any',
                agentic: true,
                messages: [{
                    role: 'user',
                    content: `implement the feature described in [notes](pdf://path/to/spec.pdf:1)

[PDF-Context] --- FILE: spec.pdf physical_page:1 ---
Page Text:
UNIQUE_MARKER_TEXT_FOR_LAZY_RESOLUTION_TEST_12345
[/PDF-Context]`,
                }],
            },
        } as any;

        await middleware.execute(context, async () => {});

        expect(capturedMessages).toBeDefined();
        const outboundText = capturedMessages!.map(m => getMessageContent(m.content)).join('\n');
        // The real content made it into the actual outbound LLM prompt — lazy resolution happened.
        expect(outboundText).toContain('UNIQUE_MARKER_TEXT_FOR_LAZY_RESOLUTION_TEST_12345');
        // The placeholder token itself should not leak into the final prompt unresolved.
        expect(outboundText).not.toMatch(/protected_ref_\d+(?!\d)/);
    });
});

describe('AgenticMiddleware - resume mutation on QueueTask objects', () => {
    const sessionId = `test-resume-mutation-${Date.now()}`;
    const projectDir = path.join(os.homedir(), '.free-llm-mcp', 'projects', sessionId);

    afterEach(async () => {
        vi.restoreAllMocks();
        try {
            await fs.remove(projectDir);
        } catch {}
    });

    it('appends "(User input: ...)" to the QueueTask.task field, not the whole entry, on continue', async () => {
        await fs.mkdirp(projectDir);
        await fs.writeJson(path.join(projectDir, 'state.json'), {
            paused: true,
            promptId: 'RESUME',
            nowQueue: [{ id: 'seed-a', task: 'run the build script' }],
            nextQueue: [],
            blockedQueue: [],
            improveQueue: [],
            resolvedContext: {},
            history: [],
        }, { spaces: 2 });

        const { LLMExecutor } = await import('../src/utils/LLMExecutor.js');
        let capturedMessages: any[] | undefined;
        vi.spyOn(LLMExecutor.prototype, 'prompt').mockImplementation(async (messages: any[]) => {
            capturedMessages = messages;
            return {
                id: 'mock-id',
                object: 'chat.completion',
                created: Date.now(),
                model: 'mock-model',
                choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
            } as any;
        });

        const middleware = new AgenticMiddleware();
        const context: PipelineContext = {
            sessionId,
            agentic: true,
            request: {
                model: 'any',
                agentic: true,
                messages: [{ role: 'user', content: 'continue RESUME build succeeded' }],
            },
        } as any;

        await middleware.execute(context, async () => {});

        expect(capturedMessages).toBeDefined();
        const outboundText = capturedMessages!.map(m => getMessageContent(m.content)).join('\n');
        // Confirms `.task` was mutated (not the whole entry replaced/stringified as
        // "[object Object] (User input: ...)") — the original task text is still readable,
        // with the resume input appended.
        expect(outboundText).toContain('run the build script');
        expect(outboundText).toContain('(User input: build succeeded)');
        expect(outboundText).not.toContain('[object Object]');
    });
});
