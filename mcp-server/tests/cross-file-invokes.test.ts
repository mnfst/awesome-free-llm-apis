import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { RepositoryGraph, WorkspaceDependencyScanner } from '../src/memory/dependency-scanner.js';

describe('Embedded snippet nodes in the repository graph', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-snippet-workspace-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('adds a code node + references edge for each jsCode field in an n8n workflow export', async () => {
    const n8nSourcePath = path.resolve(__dirname, 'context', 'daily-nday-pipeline.import.json');
    await fs.copyFile(n8nSourcePath, path.join(tempDir, 'workflow.json'));

    const scanner = new WorkspaceDependencyScanner(tempDir);
    const graph = new RepositoryGraph(tempDir);
    await scanner.scanWorkspace(graph);

    const snippetNodes = graph.getAllNodes().filter(n => n.id.startsWith('workflow.json#'));
    expect(snippetNodes.length).toBe(3);
    expect(snippetNodes.every(n => n.metadata?.language === 'javascript')).toBe(true);

    const edges = graph.getEdgesFrom('workflow.json');
    expect(edges.filter(e => e.type === 'references').length).toBe(3);
  });

  it('extracts run: snippets from a GitHub Actions workflow file', async () => {
    const workflow = `
jobs:
  build:
    steps:
      - name: Run build
        run: npm run build
`;
    await fs.writeFile(path.join(tempDir, 'ci.yml'), workflow);

    const scanner = new WorkspaceDependencyScanner(tempDir);
    const graph = new RepositoryGraph(tempDir);
    await scanner.scanWorkspace(graph);

    const snippetNodes = graph.getAllNodes().filter(n => n.id.startsWith('ci.yml#'));
    expect(snippetNodes.length).toBe(1);
    expect(snippetNodes[0].metadata?.language).toBe('bash');
  });
});

describe('Heuristic cross-file invokes edges', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-invokes-workspace-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('adds an invokes edge when a caller imports and calls an exported function', async () => {
    await fs.writeFile(
      path.join(tempDir, 'a.ts'),
      `export function doThing() { return 42; }`
    );
    await fs.writeFile(
      path.join(tempDir, 'b.ts'),
      `import { doThing } from './a.js';\nconst result = doThing();\nexport function useResult() { return result; }`
    );

    const scanner = new WorkspaceDependencyScanner(tempDir);
    const graph = new RepositoryGraph(tempDir);
    await scanner.scanWorkspace(graph);

    const edges = graph.getEdgesFrom('b.ts');
    expect(edges).toContainEqual(expect.objectContaining({ target: 'a.ts', type: 'invokes' }));
  });

  it('does not add an invokes edge when two unrelated files share a function name but no import relationship', async () => {
    await fs.writeFile(
      path.join(tempDir, 'x.ts'),
      `export function run() { return 'x'; }`
    );
    await fs.writeFile(
      path.join(tempDir, 'y.ts'),
      `export function run() { return 'y'; }\nconst r = run();`
    );

    const scanner = new WorkspaceDependencyScanner(tempDir);
    const graph = new RepositoryGraph(tempDir);
    await scanner.scanWorkspace(graph);

    const edgesFromY = graph.getEdgesFrom('y.ts');
    expect(edgesFromY.some(e => e.type === 'invokes' && e.target === 'x.ts')).toBe(false);
  });

  it('stores exported symbol names on code node metadata', async () => {
    await fs.writeFile(
      path.join(tempDir, 'lib.py'),
      `def helper_func():\n    pass\n\nclass Widget:\n    pass\n`
    );

    const scanner = new WorkspaceDependencyScanner(tempDir);
    const graph = new RepositoryGraph(tempDir);
    await scanner.scanWorkspace(graph);

    const node = graph.getNode('lib.py');
    expect(node?.metadata?.exports).toContain('helper_func');
    expect(node?.metadata?.exports).toContain('Widget');
  });
});

describe('Same-family invokes edges between embedded snippets', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-snippet-invokes-workspace-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('wires a low-confidence invokes edge between two jsCode snippets in the same workflow file', async () => {
    const workflow = JSON.stringify({
      nodes: [
        {
          name: 'Define Helper',
          parameters: { jsCode: 'function doubleValue(x) { return x * 2; }\nreturn items;' }
        },
        {
          name: 'Use Helper',
          parameters: { jsCode: 'return items.map(i => doubleValue(i.json.value));' }
        }
      ]
    });
    await fs.writeFile(path.join(tempDir, 'workflow.json'), workflow);

    const scanner = new WorkspaceDependencyScanner(tempDir);
    const graph = new RepositoryGraph(tempDir);
    await scanner.scanWorkspace(graph);

    const helperDefId = 'workflow.json#nodes[0].parameters.jsCode';
    const helperUseId = 'workflow.json#nodes[1].parameters.jsCode';

    const edges = graph.getEdgesFrom(helperUseId);
    expect(edges).toContainEqual(expect.objectContaining({ target: helperDefId, type: 'invokes', confidence: 'low' }));
  });

  it('does NOT wire an invokes edge between snippets embedded in different parent files', async () => {
    await fs.writeFile(
      path.join(tempDir, 'workflow-a.json'),
      JSON.stringify({ nodes: [{ name: 'Def', parameters: { jsCode: 'function sharedName() { return 1; }\nreturn items;' } }] })
    );
    await fs.writeFile(
      path.join(tempDir, 'workflow-b.json'),
      JSON.stringify({ nodes: [{ name: 'Use', parameters: { jsCode: 'return items.map(i => sharedName());' } }] })
    );

    const scanner = new WorkspaceDependencyScanner(tempDir);
    const graph = new RepositoryGraph(tempDir);
    await scanner.scanWorkspace(graph);

    const useId = 'workflow-b.json#nodes[0].parameters.jsCode';
    const edges = graph.getEdgesFrom(useId);
    expect(edges.some(e => e.type === 'invokes')).toBe(false);
  });
});
