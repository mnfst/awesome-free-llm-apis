import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { WorkspaceContextMiddleware } from '../src/pipeline/middlewares/WorkspaceContextMiddleware.js';
import { getIntelligentSystemPrompt, evaluatePromptSections } from '../src/pipeline/middlewares/prompts.js';

describe('Steering Evaluation & Ingestion Inspector API (/api/steering_eval)', () => {
    it('evaluatePromptSections returns matched prompt sections with content and token metadata', async () => {
        const result = await evaluatePromptSections({
            context: 'Fix bug in auth middleware and security rate limit',
            keywords: ['security', 'auth', 'rate-limit']
        });

        expect(result).toBeDefined();
        expect(typeof result.prompt).toBe('string');
        expect(result.prompt.length).toBeGreaterThan(50);
        expect(Array.isArray(result.matchedSections)).toBe(true);
        expect(result.matchedSections.length).toBeGreaterThan(0);
        expect(result.totalPromptTokens).toBeGreaterThan(0);
        // Expect section content to be populated for full inspection
        expect(result.matchedSections[0].content).toBeDefined();
        expect(typeof result.matchedSections[0].content).toBe('string');
    });

    it('WorkspaceContextMiddleware attaches comprehensive steeringTelemetry to context', async () => {
        const middleware = new WorkspaceContextMiddleware();
        const context: any = {
            request: {
                model: 'gemini-3.1-flash-lite',
                agentic: true,
                messages: [
                    { role: 'user', content: 'Fix bug in auth middleware and check security rate limiting' }
                ]
            },
            taskType: 'coder',
            keywords: ['security', 'auth', 'rate-limit'],
            workspaceRoot: process.cwd(),
            sessionId: 'test-steering-session',
            isOnePass: false,
            subtask: { id: 'subtask-1', title: 'Audit authentication logic' }
        };

        await middleware.execute(context, async () => {});

        expect(context.telemetry).toBeDefined();
        expect(context.telemetry.steeringTelemetry).toBeDefined();

        const st = context.telemetry.steeringTelemetry;
        expect(st.persona).toBe('coder');
        expect(st.matchedKeywords).toContain('security');
        expect(st.memoryLayers).toBeDefined();
        expect(st.memoryLayers.shortTermTokens).toBeDefined();
        expect(st.memoryLayers.longTermTokens).toBeDefined();
        expect(st.memoryLayers.wikiTokens).toBeDefined();
        expect(st.memoryLayers.grepTokens).toBeDefined();
        expect(st.fullAssembledSystemPrompt).toBeDefined();
        expect(st.subtaskContext).toBeDefined();
        expect(st.subtaskContext.title).toBe('Audit authentication logic');
    });
});
