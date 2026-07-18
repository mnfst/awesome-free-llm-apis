import { describe, it, expect } from 'vitest';
import { extractEmbeddedSnippets } from '../src/memory/embedded-snippet-scanner.js';

describe('extractEmbeddedSnippets', () => {
    it('extracts jsCode and pythonCode fields from nested n8n workflow JSON', () => {
        const n8nWorkflow = JSON.stringify({
            name: 'My Workflow',
            nodes: [
                {
                    name: 'Set Variables',
                    type: 'n8n-nodes-base.set',
                    parameters: { values: {} }
                },
                {
                    name: 'Transform Data',
                    type: 'n8n-nodes-base.function',
                    parameters: {
                        jsCode: 'return items.map(i => ({ json: { ...i.json, doubled: i.json.value * 2 } }));'
                    }
                },
                {
                    name: 'Python Step',
                    type: 'n8n-nodes-base.pythonFunction',
                    parameters: {
                        pythonCode: 'return [{"json": {"value": item["json"]["value"] * 2}} for item in items]'
                    }
                }
            ]
        });

        const snippets = extractEmbeddedSnippets(n8nWorkflow, '.json');
        expect(snippets.length).toBe(2);

        const js = snippets.find(s => s.language === 'javascript');
        expect(js).toBeDefined();
        expect(js?.code).toContain('items.map');
        expect(js?.parentContext).toBe('Transform Data');
        expect(js?.fieldPath).toContain('jsCode');

        const py = snippets.find(s => s.language === 'python');
        expect(py).toBeDefined();
        expect(py?.code).toContain('for item in items');
        expect(py?.parentContext).toBe('Python Step');
    });

    it('returns an empty array for malformed JSON', () => {
        const snippets = extractEmbeddedSnippets('{ not valid json', '.json');
        expect(snippets).toEqual([]);
    });

    it('returns an empty array for JSON with no known embedded-code fields', () => {
        const content = JSON.stringify({ foo: 'bar', nested: { baz: 'qux' } });
        expect(extractEmbeddedSnippets(content, '.json')).toEqual([]);
    });

    it('extracts a multi-line GitHub Actions run: block with a shell override', () => {
        const workflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Run Python script
        shell: python
        run: |
          import sys
          print("hello from ci")
          sys.exit(0)
      - name: Run tests
        run: npm test
`;
        const snippets = extractEmbeddedSnippets(workflow, '.yml');
        expect(snippets.length).toBe(2);

        const pyStep = snippets.find(s => s.language === 'python');
        expect(pyStep).toBeDefined();
        expect(pyStep?.code).toContain('print("hello from ci")');
        expect(pyStep?.parentContext).toContain('build');
        expect(pyStep?.parentContext).toContain('Run Python script');

        const bashStep = snippets.find(s => s.language === 'bash');
        expect(bashStep).toBeDefined();
        expect(bashStep?.code).toBe('npm test');
    });

    it('defaults to bash when no shell: override is present', () => {
        const workflow = `
jobs:
  test:
    steps:
      - name: Run
        run: echo "hi"
`;
        const snippets = extractEmbeddedSnippets(workflow, '.yaml');
        expect(snippets.length).toBe(1);
        expect(snippets[0].language).toBe('bash');
        expect(snippets[0].code).toBe('echo "hi"');
    });
});
