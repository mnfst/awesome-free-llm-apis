import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { AgenticMiddleware } from '../src/pipeline/middlewares/AgenticMiddleware.js';
import { classifyIntent } from '../src/pipeline/middlewares/intent-classifier.js';
import { protectInjectedReferenceBlocks } from '../src/pipeline/middlewares/AgenticMiddleware.js';
import type { PipelineContext } from '../src/pipeline/middleware.js';

describe('AgenticMiddleware - CONFUSED upgraded to QUESTION when reference content already resolved', () => {
    const sessionId = `test-confused-upgrade-${Date.now()}`;
    const projectDir = path.join(os.homedir(), '.free-llm-mcp', 'projects', sessionId);

    afterEach(async () => {
        vi.restoreAllMocks();
        try {
            await fs.remove(projectDir);
        } catch {}
    });

    const goal = `[notes](pdf://docs/spec.pdf:1) summarize this page in one sentence.

[PDF-Context] --- FILE: spec.pdf physical_page:1 ---
Page Text:
UNIQUE_MARKER_FOR_CONFUSED_UPGRADE_TEST_98765
[/PDF-Context]`;

    it('sanity check: classifyIntent on the tokenized text alone is still CONFUSED', () => {
        const { tokenized } = protectInjectedReferenceBlocks(goal);
        expect(classifyIntent(tokenized)).toBe('CONFUSED');
    });

    it('protects bracketed system sentinels (e.g. deferred-page markers) the same way as resolved references', () => {
        // A deferred-page sentinel (use-free-llm.ts's resolveFileRefs, Part A's page cap)
        // carries the original file path verbatim — capitalized segments here previously
        // leaked past protectInjectedReferenceBlocks (which only recognized protocol://
        // markers, not bracketed sentinels) and flipped classifyIntent's hasCapitalSymbol
        // heuristic to CLEAR_TASK, sending a plain "summarize" ask into full subtask
        // decomposition instead of the QUESTION/CONFUSED-upgrade path.
        const withDeferredSentinel = `protected_ref_0 [PDF-PAGE-DEFERRED: docs/assets/Some_Capitalized_File_Name.pdf:6 — resolve in a follow-up request; max 5 PDF pages per pass.] summarize each page.`;
        const { tokenized, placeholders } = protectInjectedReferenceBlocks(withDeferredSentinel);
        expect(tokenized).not.toContain('Capitalized');
        expect(tokenized).not.toContain('[PDF-PAGE-DEFERRED');
        expect(classifyIntent(tokenized)).not.toBe('CLEAR_TASK');
        const sentinelPlaceholder = [...placeholders.entries()].find(([, v]) => v.includes('PDF-PAGE-DEFERRED'))?.[0];
        expect(sentinelPlaceholder).toBeDefined();
        expect(placeholders.get(sentinelPlaceholder!)).toContain('Some_Capitalized_File_Name.pdf:6');
    });

    it('routes through QUESTION (real router, resolved content in prompt) instead of asking a clarifying question', async () => {
        const { getSharedRouter } = await import('../src/pipeline/instances.js');
        const routerSpy = vi.spyOn(getSharedRouter(), 'execute').mockImplementation(async (ctx: any) => {
            ctx.response = {
                id: 'router-mock',
                object: 'chat.completion',
                created: Date.now(),
                model: 'mock-model',
                choices: [{ index: 0, message: { role: 'assistant', content: 'Routed via QUESTION path.' }, finish_reason: 'stop' }],
            };
        });

        const middleware = new AgenticMiddleware();
        const context: PipelineContext = {
            sessionId,
            agentic: true,
            request: {
                model: 'any',
                agentic: true,
                messages: [{ role: 'user', content: goal }],
            },
        } as any;

        await middleware.execute(context, async () => {});

        // QUESTION path used the real router — not the CONFUSED clarification path (which
        // never calls getSharedRouter().execute at all, only builds a bare markdown response).
        expect(routerSpy).toHaveBeenCalled();

        const content = context.response?.choices?.[0]?.message?.content as string;
        expect(content).not.toContain('I need a bit more detail');
        expect(content).toBe('Routed via QUESTION path.');
    });
});
