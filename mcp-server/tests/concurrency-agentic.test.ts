import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import fs from 'fs-extra';
import { AgenticMiddleware } from '../src/pipeline/middlewares/AgenticMiddleware.js';
import { PipelineContext } from '../src/pipeline/middleware.js';

describe('AgenticMiddleware - Concurrency Stress Test', () => {
    const sessionId = `test-concurrency-${Date.now()}`;
    const PROJECTS_DIR = path.resolve('./data/projects');
    const projectDir = path.join(PROJECTS_DIR, sessionId);

    beforeAll(async () => {
        await fs.mkdirp(projectDir);
        // Seed a paused state resembling case-h-pause.json
        const pausedState = {
            sessionId,
            paused: true,
            promptId: 'TESTID',
            nowQueue: [{ id: 'seed1', task: 'Please run the build script `npm run build` in the workspace.' }],
            nextQueue: [],
            blockedQueue: [],
            history: []
        };
        await fs.writeJson(path.join(projectDir, 'state.json'), pausedState, { spaces: 2 });
    });

    afterAll(async () => {
        try {
            await fs.remove(projectDir);
        } catch {}
    });

    it('should handle concurrent resume requests to the same session without corruption', async () => {
        const middleware = new AgenticMiddleware();
        // Mock LLMExecutor.prompt to bypass actual LLM provider calls
        const { LLMExecutor } = await import('../src/utils/LLMExecutor.js');
        vi.spyOn(LLMExecutor.prototype, 'prompt').mockResolvedValue({
            id: 'mock-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'mock-model',
            choices: [{
                index: 0,
                message: { role: 'assistant', content: 'mocked subtask response' },
                finish_reason: 'stop'
            }]
        } as any);

        // Mock sharedRouter.execute to bypass actual LLM provider calls
        const { getSharedRouter } = await import('../src/pipeline/instances.js');
        getSharedRouter().execute = async (ctx, next) => {
            ctx.response = {
                id: 'mock-id',
                object: 'chat.completion',
                created: Date.now(),
                model: 'mock-model',
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content: 'mocked subtask response' },
                    finish_reason: 'stop'
                }]
            } as any;
        };

        // Create two parallel pipeline contexts representing concurrent resume requests
        const contextA: PipelineContext = {
            sessionId,
            agentic: true,
            workspaceRoot: projectDir,
            request: {
                model: 'any',
                messages: [
                    { role: 'user', content: 'continue TESTID build output A' }
                ],
                agentic: true
            }
        };

        const contextB: PipelineContext = {
            sessionId,
            agentic: true,
            workspaceRoot: projectDir,
            request: {
                model: 'any',
                messages: [
                    { role: 'user', content: 'continue TESTID build output B' }
                ],
                agentic: true
            }
        };

        // Execute both middleware chains concurrently
        // Note: we mock next() to just resolve
        const nextMock = async () => {};

        const executions = Promise.all([
            middleware.execute(contextA, nextMock),
            middleware.execute(contextB, nextMock)
        ]);

        // Verify that they execute without throwing any filesystem or parsing errors
        await expect(executions).resolves.not.toThrow();

        // Read the final state to ensure it is valid JSON
        const finalState = await fs.readJson(path.join(projectDir, 'state.json'));
        expect(finalState).toHaveProperty('sessionId', sessionId);
        expect(finalState.paused === true || finalState.paused === false).toBe(true);
    });
});
