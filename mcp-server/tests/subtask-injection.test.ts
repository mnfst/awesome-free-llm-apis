import { describe, it, expect, vi } from 'vitest';
import { decomposeGoal, protectInjectedReferenceBlocks } from '../src/pipeline/middlewares/AgenticMiddleware.js';
import { AgenticMiddleware } from '../src/pipeline/middlewares/AgenticMiddleware.js';
import { classifyIntent } from '../src/pipeline/middlewares/intent-classifier.js';
import type { PipelineContext } from '../src/pipeline/middleware.js';
import fs from 'fs-extra';
import path from 'path';

describe('decomposeGoal Subtask List Parsing Tests', () => {
    it('parses numbered list "1. step" into array', () => {
        const goal = `
Here is my plan:
1. First step to verify files
2. Second step to execute tests
        `.trim();
        const { tasks } = decomposeGoal(goal);
        expect(tasks.map(t => t.task)).toEqual([
            'First step to verify files',
            'Second step to execute tests'
        ]);
    });

    it('parses bulleted list "- step" into array', () => {
        const goal = `
Please do:
- Read package.json
- Upgrade vitest version
        `.trim();
        const { tasks } = decomposeGoal(goal);
        expect(tasks.map(t => t.task)).toEqual([
            'Read and inspect package.json',
            'Upgrade vitest version'
        ]);
    });

    it('parses "* step" bullets', () => {
        const goal = `
* Compile the code base
* Run verification scripts
        `.trim();
        const { tasks } = decomposeGoal(goal);
        expect(tasks.map(t => t.task)).toEqual([
            'Compile the code base',
            'Run verification scripts'
        ]);
    });

    it('falls back to newline-split for plain prose', () => {
        const goal = `
Line one description
Line two description
        `.trim();
        const { tasks } = decomposeGoal(goal);
        expect(tasks.map(t => t.task)).toEqual([
            'Line one description',
            'Line two description'
        ]);
    });

    it('semantically combines consecutive read file steps', () => {
        const goal = `
1. Read package.json
2. Read vitest.config.ts
3. Implement a new route in server.ts
        `.trim();
        const { tasks } = decomposeGoal(goal);
        expect(tasks.map(t => t.task)).toEqual([
            'Read and inspect package.json, vitest.config.ts',
            'Implement a new route in server.ts'
        ]);
    });

    it('keeps an injected PDF-Context block as one step, replaced with a placeholder (not raw content)', () => {
        const goal = `[cyber notes](pdf://path/to/file.pdf:1) summarize page 1

[PDF-Context] --- FILE: file.pdf physical_page:1 ---
Page Text:
Line one of the extracted page
Line two of the extracted page
Line three of the extracted page
[/PDF-Context]`;
        const { tasks, resolvedContext } = decomposeGoal(goal);
        // One step, not shredded into one-line fragments.
        expect(tasks.length).toBe(1);
        // The planner-facing task text stays short/clean — placeholder, not raw PDF content —
        // this is the actual fix for "planner sees raw injected content" (task-classifier.ts's
        // dependency/file-extraction heuristics only ever see this short form).
        expect(tasks[0].task).not.toContain('Line one of the extracted page');
        expect(tasks[0].task).toMatch(/^protected_ref_\d+$/);
        // The real content is retained, keyed by that same placeholder, for lazy resolution
        // at actual subtask-execution time (executeSingleSubtask).
        const placeholder = tasks[0].task;
        expect(resolvedContext[placeholder]).toContain('[PDF-Context] --- FILE: file.pdf physical_page:1 ---');
        expect(resolvedContext[placeholder]).toContain('Line one of the extracted page');
        expect(resolvedContext[placeholder]).toContain('Line two of the extracted page');
        expect(resolvedContext[placeholder]).toContain('Line three of the extracted page');
    });

    it('keeps an injected fenced file:// content block as one step, replaced with a placeholder', () => {
        const goal = `Review this file:
file://notes.md
\`\`\`notes.md
first line
second line
third line
\`\`\`
Then summarize it.`;
        const { tasks, resolvedContext } = decomposeGoal(goal);
        const blockStep = tasks.find(t => /^protected_ref_\d+$/.test(t.task));
        expect(blockStep).toBeDefined();
        const resolved = resolvedContext[blockStep!.task];
        expect(resolved).toContain('```notes.md');
        expect(resolved).toContain('first line');
        expect(resolved).toContain('second line');
        expect(resolved).toContain('third line');
    });

    it('does not let capitalized words inside injected PDF content flip classifyIntent to CLEAR_TASK', () => {
        // A plain "summarize this page" ask has no task verbs or question words of its own —
        // classifyIntent should treat it as QUESTION (or CONFUSED), never CLEAR_TASK, regardless
        // of what's inside the injected PDF page content.
        const rawContent = `[notes](pdf://docs/assets/day3_sttp_on_Ethical_Hacking_and_Cyber_Forensics.pdf:1) summarize this page in one sentence.

pdf://docs/assets/day3_sttp_on_Ethical_Hacking_and_Cyber_Forensics.pdf:1

[PDF-Context] --- FILE: day3_sttp_on_Ethical_Hacking_and_Cyber_Forensics.pdf physical_page:1 ---
Page Text:
Day 3: Ethical Hacking and Cyber Forensics @IITK
Network Forensics with Wireshark and Cryptography Fundamentals`;

        // Bug reproduction: classifying the raw, unprotected content is polluted by
        // capitalized words in the injected PDF text/filename (e.g. "Ethical", "Forensics").
        expect(classifyIntent(rawContent)).toBe('CLEAR_TASK');

        // Fix: classifying the tokenized content (injected reference blocks replaced with
        // opaque placeholders) reflects only what the user actually typed.
        const { tokenized } = protectInjectedReferenceBlocks(rawContent);
        expect(classifyIntent(tokenized)).not.toBe('CLEAR_TASK');
    });

    it('proactively injects file content context before router execution for simple read subtask', async () => {
        const middleware = new AgenticMiddleware();
        const testFile = path.join(process.cwd(), 'temp-read-test.json');
        await fs.writeJson(testFile, { test: 'hello-proactive-context' });

        const context: PipelineContext = {
            request: {
                messages: [{ role: 'user', content: `Read ${testFile}` }]
            },
            agentic: true,
            sessionId: 'test-proactive-read-session',
            wsHash: 'dummy-hash'
        } as any;

        const { getSharedRouter } = await import('../src/pipeline/instances.js');
        const routerSpy = vi.spyOn(getSharedRouter(), 'execute');

        try {
            await middleware.execute(context, async () => {});
            expect(routerSpy).not.toHaveBeenCalled();
            const responseContent = context.response?.choices?.[0]?.message?.content;
            expect(responseContent).toContain('hello-proactive-context');
        } finally {
            await fs.remove(testFile);
            vi.restoreAllMocks();
        }
    });
});
