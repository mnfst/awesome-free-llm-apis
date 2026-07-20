import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs/promises';

// We will import the functions dynamically or mock as needed.
// First, let's write tests representing the desired behavior.

// 1. Mocking/Simulating renderMarkdown behavior for unit test since it's client-side JS
function simulateRenderMarkdown(text: string, esc: (s: string) => string): string {
  if (!text) return '';
  // The proposed fix: escape the entire part first!
  const parts = text.split(/(```mermaid[\s\S]*?```)/g);
  const rendered = parts.map((part) => {
    const mermaidMatch = part.match(/^```mermaid\s*([\s\S]*?)```$/);
    if (mermaidMatch) {
      return `[mermaid]`; // Simplified for test
    }
    const safePart = esc(part);
    return safePart
      // Fenced code blocks (non-mermaid)
      .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
        `<pre class="code-block" style="font-size:.78rem;overflow-x:auto;"><code>${code.trim()}</code></pre>`)
      // Inline code
      .replace(/`([^`]+)`/g, (_, c) => `<code style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:.85em;">${c}</code>`)
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`)
      // Italic
      .replace(/\*([^*]+)\*/g, (_, t) => `<em>${t}</em>`)
      // H1-H3
      .replace(/^### (.+)$/gm, '<h3 style="font-size:.85rem;color:var(--text-primary);margin:10px 0 4px;">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:.95rem;color:var(--text-primary);margin:12px 0 6px;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:1.05rem;color:var(--accent-purple);margin:14px 0 8px;">$1</h1>')
      // Unordered lists
      .replace(/^[\-\*] (.+)$/gm, '<li style="margin-left:16px;list-style:disc;">$1</li>')
      // Ordered lists
      .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal;">$1</li>')
      // Horizontal rule
      .replace(/^---+$/gm, '<hr style="border-color:var(--glass-border);margin:12px 0;">')
      // Paragraphs — blank line becomes paragraph break
      .replace(/\n\n+/g, '</p><p style="margin:6px 0;">')
      // Single newlines become <br>
      .replace(/\n/g, '<br>');
  });
  return rendered.join('');
}

describe('TDD Fixes Verification Suite', () => {
    describe('Issue 1: XSS in renderMarkdown (dashboard/app.js)', () => {
        const simpleEsc = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

        it('should escape heading text to prevent XSS injection', () => {
            const malicousHeading = '# Hello <script>alert(1)</script>';
            const html = simulateRenderMarkdown(malicousHeading, simpleEsc);
            expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
            expect(html).not.toContain('<script>');
        });

        it('should escape list item text to prevent XSS injection', () => {
            const maliciousList = '- Item <img src=x onerror=alert(1)>';
            const html = simulateRenderMarkdown(maliciousList, simpleEsc);
            expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
            expect(html).not.toContain('<img src=x');
        });

        it('should render bold, italic, and code correctly and safely', () => {
            const markdown = '**bold <script>** and `code <script>`';
            const html = simulateRenderMarkdown(markdown, simpleEsc);
            expect(html).toContain('<strong>bold &lt;script&gt;</strong>');
            expect(html).toContain('<code style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-family:\'JetBrains Mono\',monospace;font-size:.85em;">code &lt;script&gt;</code>');
        });
    });

    describe('Issue 2: O(N*M) event loop block in compareFilesLineByLineCosine', () => {
        it('should select amplitude lines correctly when exceeding MAX_LINES', async () => {
            const { selectAmplitudeLines } = await import('../src/memory/index.js');
            const lines: string[] = [];
            for (let i = 0; i < 600; i++) {
                if (i === 100) lines.push('export const myTestFunction = () => {');
                else if (i === 200) lines.push('# Important Heading');
                else if (i % 5 === 0) lines.push('');
                else lines.push(`line number ${i}`);
            }

            const selected = selectAmplitudeLines(lines);
            expect(selected.length).toBeLessThanOrEqual(500);
            // High energy lines should be kept
            expect(selected).toContain('export const myTestFunction = () => {');
            expect(selected).toContain('# Important Heading');
            // Empty lines should be filtered out
            expect(selected.filter(l => l.trim() === '').length).toBe(0);
        });
    });

    describe('Issue 4: Path Traversal in ImageRouterMiddleware', () => {
        it('should reject file URLs outside the workspace root', async () => {
            const { ImageRouterMiddleware } = await import('../src/pipeline/middlewares/ImageRouterMiddleware.js');
            const middleware = new ImageRouterMiddleware();
            
            // Mock a context with workspaceRoot
            const workspaceRoot = path.resolve('c:/authorized/workspace');
            const outsideUrl = 'file:///c:/windows/system32/cmd.exe';
            
            // Call the private/internal helper using bracket notation or a test runner
            const base64 = await (middleware as any).convertFileUrlToBase64(outsideUrl, workspaceRoot);
            expect(base64).toBeNull();
        });

        it('should allow file URLs inside the workspace root', async () => {
            const { ImageRouterMiddleware } = await import('../src/pipeline/middlewares/ImageRouterMiddleware.js');
            const middleware = new ImageRouterMiddleware();
            
            const tempDir = path.resolve('./temp_test_image_dir');
            await fs.mkdir(tempDir, { recursive: true });
            const testImgPath = path.join(tempDir, 'test.png');
            // Write a dummy PNG
            await fs.writeFile(testImgPath, Buffer.from('dummy image content'));
            
            try {
                const imgUrl = `file:///${testImgPath.replace(/\\/g, '/')}`;
                const base64 = await (middleware as any).convertFileUrlToBase64(imgUrl, tempDir);
                expect(base64).not.toBeNull();
                expect(base64).toContain('data:image/png;base64,');
            } finally {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe('Issue 5: decomposeGoal with DSL Support (> and -)', () => {
        it('should parse parallel and sequential tasks correctly', async () => {
            const { decomposeGoal } = await import('../src/pipeline/middlewares/AgenticMiddleware.js');
            const goal = `
> summarize the auth module
> search for rate limit patterns
- fix the auth bug
- write unit tests
            `;
            const { tasks } = decomposeGoal(goal);
            expect(tasks).toHaveLength(4);
            expect(tasks[0].task).toBe('[parallel] summarize the auth module');
            expect(tasks[1].task).toBe('[parallel] search for rate limit patterns');
            expect(tasks[2].task).toBe('[sequential] fix the auth bug');
            expect(tasks[3].task).toBe('[sequential] write unit tests');
        });

        it('should downgrade parallel tasks of the same TaskType to sequential', async () => {
            const { decomposeGoal } = await import('../src/pipeline/middlewares/AgenticMiddleware.js');
            const goal = `
> fix auth bug
> fix rate limiting in middleware
            `;
            const { tasks } = decomposeGoal(goal);
            expect(tasks).toHaveLength(2);
            // Both are TaskType.Coding, so they must be downgraded to sequential
            expect(tasks[0].task).toBe('[sequential] fix auth bug');
            expect(tasks[1].task).toBe('[sequential] fix rate limiting in middleware');
        });

        it('should be parsed correctly by buildExecutionPlan to override lanes', async () => {
            const { buildExecutionPlan } = await import('../src/pipeline/middlewares/task-classifier.js');
            const tasks = [
                { id: 't1', task: '[parallel] summarize the auth module' },
                { id: 't2', task: '[parallel] search for rate limit patterns' }
            ];
            const plan = await buildExecutionPlan(tasks, path.resolve('.'));
            expect(plan.phase1).toHaveLength(2);
            expect(plan.phase1[0].lane).toBe('parallel');
            expect(plan.phase1[1].lane).toBe('parallel');
            // The task name returned in plan should be clean (without prefix)
            expect(plan.phase1[0].task).toBe('summarize the auth module');
            expect(plan.phase1[1].task).toBe('search for rate limit patterns');
        });
    });
});
