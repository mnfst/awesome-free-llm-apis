import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { RepositoryGraph } from '../src/memory/dependency-scanner.js';
import { diffGraphs } from '../src/memory/graph-diff.js';
import {
  shouldRunWikiMaintenance,
  markStaleForRemovedFiles,
  parseAndValidateDecisions,
  decideWikiUpdates,
} from '../src/memory/wiki-maintainer.js';
import { WikiMemory } from '../src/memory/wiki.js';
import { memoryManager } from '../src/memory/index.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { wikiConfig } from '../src/config/wiki-config.js';

describe('diffGraphs', () => {
  it('treats everything as new when there is no prior graph', () => {
    const graph = new RepositoryGraph('/tmp/ws');
    graph.addNode('a.ts', 'code');
    graph.addNode('b.ts', 'code');
    graph.addEdge('a.ts', 'b.ts', 'imports');

    const diff = diffGraphs(null, graph);
    expect(diff.newNodes.map(n => n.id).sort()).toEqual(['a.ts', 'b.ts']);
    expect(diff.newEdges.length).toBe(1);
    expect(diff.removedNodes).toEqual([]);
    expect(diff.removedEdges).toEqual([]);
  });

  it('buckets new and removed nodes/edges correctly', () => {
    const oldGraph = new RepositoryGraph('/tmp/ws');
    oldGraph.addNode('a.ts', 'code');
    oldGraph.addNode('b.ts', 'code');
    oldGraph.addEdge('a.ts', 'b.ts', 'imports');

    const newGraph = new RepositoryGraph('/tmp/ws');
    newGraph.addNode('a.ts', 'code');
    newGraph.addNode('c.ts', 'code'); // new
    newGraph.addEdge('a.ts', 'c.ts', 'imports'); // new
    // b.ts removed, a.ts->b.ts edge removed

    const diff = diffGraphs(oldGraph, newGraph);
    expect(diff.newNodes.map(n => n.id)).toEqual(['c.ts']);
    expect(diff.removedNodes.map(n => n.id)).toEqual(['b.ts']);
    expect(diff.newEdges).toContainEqual(expect.objectContaining({ source: 'a.ts', target: 'c.ts', type: 'imports' }));
    expect(diff.removedEdges).toContainEqual(expect.objectContaining({ source: 'a.ts', target: 'b.ts', type: 'imports' }));
  });

  it('does not double-count a confidence-only change on the same logical edge', () => {
    const oldGraph = new RepositoryGraph('/tmp/ws');
    oldGraph.addNode('a.ts', 'code');
    oldGraph.addNode('b.ts', 'code');
    oldGraph.addEdge('a.ts', 'b.ts', 'invokes', { confidence: 'low' });

    const newGraph = new RepositoryGraph('/tmp/ws');
    newGraph.addNode('a.ts', 'code');
    newGraph.addNode('b.ts', 'code');
    newGraph.addEdge('a.ts', 'b.ts', 'invokes'); // same edge, now normal-confidence

    const diff = diffGraphs(oldGraph, newGraph);
    expect(diff.newEdges).toEqual([]);
    expect(diff.removedEdges).toEqual([]);
  });
});

describe('shouldRunWikiMaintenance (non-git fallback)', () => {
  let tempDir: string;
  const wsHash = 'wiki-maint-test-hash';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wiki-maint-workspace-'));
    // Ensure no .git directory so DiffScanner reports hasGit: false
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    const keys = await memoryManager.longTerm.list();
    for (const key of keys) {
      if (key.startsWith(`file:${wsHash}:`)) await memoryManager.longTerm.delete(key);
    }
  });

  it('runs on first check, skips on unchanged fingerprint, runs again after a mtime change', async () => {
    await memoryManager.longTerm.save(`file:${wsHash}:a.ts:mtime`, 1000);
    await memoryManager.longTerm.save(`file:${wsHash}:b.ts:mtime`, 2000);

    const first = await shouldRunWikiMaintenance(tempDir, wsHash);
    expect(first.run).toBe(true);

    // Persist meta as runWikiMaintenance would, using the fingerprint from the first check
    const metaPath = path.join(tempDir, '.free-llm-mcp', 'wiki_maintenance_meta.json');
    await fs.mkdir(path.dirname(metaPath), { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify({
      lastSyncCommitHash: '',
      lastSyncFileFingerprint: first.freshFingerprint,
      lastSyncedAt: Date.now(),
      hasGit: false,
    }));

    const second = await shouldRunWikiMaintenance(tempDir, wsHash);
    expect(second.run).toBe(false);

    await memoryManager.longTerm.save(`file:${wsHash}:a.ts:mtime`, 9999);
    const third = await shouldRunWikiMaintenance(tempDir, wsHash);
    expect(third.run).toBe(true);
  });
});

describe('markStaleForRemovedFiles', () => {
  const testDir = path.join(process.cwd(), 'temp_test_wiki_maintenance_ws');
  const wsHash = 'stale-test-hash';

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('marks a wiki page stale when its content references a deleted file', async () => {
    const wiki = new WikiMemory(wsHash, testDir);
    await wiki.write('Old Thing Module', 'Documentation for src/old-thing.ts, which handles legacy exports.', ['code']);

    await markStaleForRemovedFiles(wiki, [{ id: 'src/old-thing.ts', type: 'code' }]);

    const page = await wiki.read('Old Thing Module');
    expect(page?.content).toContain('Stale — Source Deleted');
    expect(page?.confidence).toBe(0);
  });

  it('leaves unrelated pages untouched', async () => {
    const wiki = new WikiMemory(wsHash, testDir);
    await wiki.write('Unrelated Page', 'Nothing to do with the deleted file.', ['code']);

    await markStaleForRemovedFiles(wiki, [{ id: 'src/old-thing.ts', type: 'code' }]);

    const page = await wiki.read('Unrelated Page');
    expect(page?.content).not.toContain('Stale');
    expect(page?.confidence).toBe(0.5);
  });

  it('skips non-code nodes', async () => {
    const wiki = new WikiMemory(wsHash, testDir);
    await wiki.write('Concept Page', 'References concept:old-thing somewhere.', ['code']);

    await markStaleForRemovedFiles(wiki, [{ id: 'concept:old-thing', type: 'concept' }]);

    const page = await wiki.read('Concept Page');
    expect(page?.content).not.toContain('Stale');
  });
});

describe('parseAndValidateDecisions', () => {
  const candidates = new Set(['Existing Page A', 'Existing Page B']);

  it('parses fenced JSON and keeps only links present in the candidate set', () => {
    const raw = '```json\n[{"title":"New Page","content":"Some content.","tags":["code"],"links":["Existing Page A","Made Up Page"]}]\n```';
    const decisions = parseAndValidateDecisions(raw, candidates);
    expect(decisions.length).toBe(1);
    expect(decisions[0].title).toBe('New Page');
    expect(decisions[0].links).toEqual(['Existing Page A']);
  });

  it('parses unfenced JSON', () => {
    const raw = '[{"title":"Plain Page","content":"Body text.","tags":[],"links":[]}]';
    const decisions = parseAndValidateDecisions(raw, candidates);
    expect(decisions.length).toBe(1);
    expect(decisions[0].title).toBe('Plain Page');
  });

  it('returns [] for malformed JSON', () => {
    expect(parseAndValidateDecisions('not json at all', candidates)).toEqual([]);
  });

  it('returns [] for a non-array top-level value', () => {
    expect(parseAndValidateDecisions('{"title":"x","content":"y"}', candidates)).toEqual([]);
  });

  it('drops elements missing a title or content', () => {
    const raw = '[{"title":"","content":"has content"},{"title":"has title","content":""}]';
    expect(parseAndValidateDecisions(raw, candidates)).toEqual([]);
  });

  it('drops elements whose content exceeds the page-size budget', () => {
    const raw = JSON.stringify([{ title: 'Too Big', content: 'a'.repeat(wikiConfig.maxPageBodyBytes + 1), tags: [], links: [] }]);
    expect(parseAndValidateDecisions(raw, candidates)).toEqual([]);
  });

  it('matches candidate links case-insensitively', () => {
    const raw = JSON.stringify([{ title: 'X', content: 'y', tags: [], links: ['existing page a'] }]);
    const decisions = parseAndValidateDecisions(raw, candidates);
    expect(decisions[0].links).toEqual(['Existing Page A']);
  });
});

describe('decideWikiUpdates no-op smoke test', () => {
  it('never calls the provider registry when the diff is empty', async () => {
    const getInstanceSpy = vi.spyOn(ProviderRegistry, 'getInstance');

    const graph = new RepositoryGraph('/tmp/ws');
    const wiki = new WikiMemory('smoke-test-hash', path.join(os.tmpdir(), 'wiki-maint-smoke'));

    const decisions = await decideWikiUpdates({
      workspaceRoot: '/tmp/ws',
      wiki,
      diff: { newNodes: [], removedNodes: [], newEdges: [], removedEdges: [] },
      graph,
    });

    expect(decisions).toEqual([]);
    expect(getInstanceSpy).not.toHaveBeenCalled();

    getInstanceSpy.mockRestore();
    await fs.rm(path.join(os.tmpdir(), 'wiki-maint-smoke'), { recursive: true, force: true });
  });
});
