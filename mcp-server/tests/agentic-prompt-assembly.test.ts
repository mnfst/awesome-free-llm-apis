import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getIntelligentSystemPrompt, resetPromptCache } from '../src/pipeline/middlewares/prompts.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Resolve the base directory relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Agentic Prompt Assembly Logic', () => {
    beforeEach(() => {
        resetPromptCache();
        // Ensure the path is correctly set for tests
        process.env.AGENT_PROMPT_PATH = path.resolve(__dirname, '../../../external/agent-prompt');
    });

    it('should generate a full prompt for non-subtask requests', async () => {
        const prompt = await getIntelligentSystemPrompt({
            context: 'Help me with a complex architecture task',
            isSubtask: false
        });

        // Full prompts should include the introduction (Identity)
        expect(prompt).toContain('# ROLE');
        // It should be reasonably long
        expect(prompt.length).toBeGreaterThan(1000);
        // It should include grounding
        expect(prompt).toContain('🔍 GROUNDING');
    });

    it('should generate a minimal prompt for subtasks', async () => {
        const prompt = await getIntelligentSystemPrompt({
            context: 'Small fix',
            isSubtask: true
        });

        // Subtask prompts should have a minimal identity
        expect(prompt).toContain('# ROLE');
        // But it should be significantly shorter than full prompt
        const fullPrompt = await getIntelligentSystemPrompt({ context: 'Small fix', isSubtask: false });
        expect(prompt.length).toBeLessThan(fullPrompt.length);
    });

    it('should respect the strict 8000 character budget for subtasks', async () => {
        // We'll use a query that matches a lot of keywords to try and bloat the prompt
        // Using keywords from 'reliability_math_and_harness_engineering' which is large
        const prompt = await getIntelligentSystemPrompt({
            context: 'Implement reliability math and harness engineering for the test suite with specialized libraries',
            keywords: ['reliability', 'math', 'harness', 'engineering', 'specialized', 'library'],
            isSubtask: true
        });

        expect(prompt.length).toBeLessThanOrEqual(8000);
        // Should contain truncation marker if it was truncated (which it should be for this query)
        if (prompt.length > 7000) {
            expect(prompt).toContain('[...TRUNCATED...]');
        }
    });

    it('should normalize scores for keyword-bloated sections', async () => {
        // The 'reliability_math_and_harness_engineering' section has >500 keywords.
        // We want to ensure it doesn't always win if the query is only slightly related.
        const prompt = await getIntelligentSystemPrompt({
            context: 'Just a simple test',
            keywords: ['test'],
            isSubtask: true
        });

        // Reliability math shouldn't be selected for a generic 'test' query
        expect(prompt).not.toContain('RELIABILITY MATH AND HARNESS ENGINEERING');
    });

    it('should inject workspace memory at the very top', async () => {
        const memory = 'User previously preferred using Vitest over Jest.';
        const prompt = await getIntelligentSystemPrompt({
            context: 'Write a test',
            memory: memory,
            isSubtask: true
        });

        expect(prompt.startsWith('## 🧠 WORKSPACE MEMORY')).toBe(true);
        expect(prompt).toContain(memory);
    });

    it('should vary sections based on explicit keywords (Strict Steering)', async () => {
        const promptArch = await getIntelligentSystemPrompt({
            context: 'Something generic',
            keywords: ['architecture', 'patterns'],
            isSubtask: true
        });

        const promptReliability = await getIntelligentSystemPrompt({
            context: 'Something generic',
            keywords: ['reliability', 'safety'],
            isSubtask: true
        });

        expect(promptArch).not.toEqual(promptReliability);
        expect(promptArch).toContain('ARCHITECTURE');
        expect(promptReliability).toContain('RELIABILITY');
    });

    it('should inject target project AGENTS.md guidelines contextually filtered by query', async () => {
        const tempWs = path.join(__dirname, 'temp_prompt_agents_ws');
        await fs.promises.rm(tempWs, { recursive: true, force: true });
        await fs.promises.mkdir(path.join(tempWs, '.agents'), { recursive: true });

        const agentsContent = `# Project Guidelines
This is the root introduction.

## Git Workflow
Section Content: Use git commit -m "feat(scope): message"

## Monorepo Testing
Section Content: Run pytest using uv run pytest -v
`;
        await fs.promises.writeFile(path.join(tempWs, '.agents', 'AGENTS.md'), agentsContent, 'utf-8');

        // Test with git query -> should select Git Workflow
        const promptGit = await getIntelligentSystemPrompt({
            context: 'Commit changes to git',
            isSubtask: true,
            workspaceRoot: tempWs
        });

        expect(promptGit).toContain('TARGET PROJECT GUIDELINES');
        expect(promptGit).toContain('Git Workflow');
        expect(promptGit).not.toContain('Monorepo Testing');

        // Test with test query -> should select Monorepo Testing
        const promptTest = await getIntelligentSystemPrompt({
            context: 'Run unit tests',
            isSubtask: true,
            workspaceRoot: tempWs
        });

        expect(promptTest).toContain('TARGET PROJECT GUIDELINES');
        expect(promptTest).toContain('Monorepo Testing');
        expect(promptTest).not.toContain('Git Workflow');

        await fs.promises.rm(tempWs, { recursive: true, force: true });
    });
});
