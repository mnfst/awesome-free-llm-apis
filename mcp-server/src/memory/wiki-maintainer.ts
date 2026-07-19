import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DiffScanner } from '../pipeline/middlewares/diff-scanner.js';
import { RepositoryGraph, type Node } from './dependency-scanner.js';
import { diffGraphs, type GraphDiff } from './graph-diff.js';
import { memoryManager } from './index.js';
import type { WikiMemory, WikiPage } from './wiki.js';
import { ProviderRegistry } from '../providers/registry.js';
import { withFileLock } from '../utils/file-lock.js';
import { writeFileAtomic } from '../utils/FileUtils.js';

// See long-term.ts/vector.ts for the same rationale: withFileLock() already reaps a
// genuinely stuck/orphaned lock, so this only needs to be long enough that ordinary
// contention (e.g. two concurrent maintenance runs on the same workspace) waits its
// turn instead of failing.
const LOCK_WAIT_MS = 30000;

export interface WikiMaintenanceMeta {
  lastSyncCommitHash: string;
  lastSyncFileFingerprint?: string;
  lastSyncedAt: number;
  hasGit: boolean;
}

export interface WikiMaintenanceDecision {
  title: string;
  content: string;
  tags: string[];
  links: string[];
}

const MAX_PAGE_BODY_BYTES = 3500; // stay comfortably under WikiMemory's 4096-byte MAX_PAGE_SIZE once frontmatter is added
const MAX_TITLE_LENGTH = 200;
const MAX_DIFF_SUMMARY_CHARS = 3000;
const MAX_CANDIDATE_PAGES = 15;
const MAX_CANDIDATE_KEYWORDS = 8;

function metaPathFor(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.free-llm-mcp', 'wiki_maintenance_meta.json');
}

function prevGraphPathFor(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.free-llm-mcp', 'repo_graph_prev.json');
}

async function readJsonSafe(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Builds a stable fingerprint from the per-file mtime cache WorkspaceIndexer already
 * maintains (`file:<wsHash>:<relPath>:mtime` in memoryManager.longTerm) — reused here
 * instead of re-walking the workspace, for workspaces without git.
 */
async function computeFileFingerprint(wsHash: string): Promise<string> {
  const keys = await memoryManager.longTerm.list();
  const mtimeKeys = keys.filter(k => k.startsWith(`file:${wsHash}:`) && k.endsWith(':mtime')).sort();
  const pairs: string[] = [];
  for (const key of mtimeKeys) {
    const mtime = await memoryManager.longTerm.load(key);
    pairs.push(`${key}:${mtime}`);
  }
  return crypto.createHash('md5').update(pairs.join('|')).digest('hex');
}

/**
 * Condition gate: only signals `run: true` when the project's state has actually moved
 * since the last successful wiki sync — a git commit hash change, or (for non-git
 * workspaces) a change in the per-file mtime fingerprint. This is the deliberate
 * replacement for reacting to arbitrary chat text.
 */
export async function shouldRunWikiMaintenance(
  workspaceRoot: string,
  wsHash: string
): Promise<{ run: boolean; meta: WikiMaintenanceMeta | null; freshCommitHash?: string; freshFingerprint?: string }> {
  const meta: WikiMaintenanceMeta | null = await readJsonSafe(metaPathFor(workspaceRoot));

  let diffScan;
  try {
    diffScan = await DiffScanner.scan(workspaceRoot);
  } catch {
    diffScan = null;
  }

  if (diffScan?.hasGit) {
    const freshCommitHash = diffScan.lastCommitHash || '';
    const run = !meta || meta.lastSyncCommitHash !== freshCommitHash || !freshCommitHash;
    return { run, meta, freshCommitHash };
  }

  const freshFingerprint = await computeFileFingerprint(wsHash);
  const run = !meta || meta.lastSyncFileFingerprint !== freshFingerprint;
  return { run, meta, freshFingerprint };
}

/**
 * For each removed code node, best-effort match it against existing wiki pages that
 * textually reference the deleted file, and mark them stale (non-destructive — just
 * drops confidence and prepends a warning header). Uses WikiMemory.markStale(), which
 * previously had zero callers anywhere in the codebase.
 */
export async function markStaleForRemovedFiles(wiki: WikiMemory, removedNodes: Node[]): Promise<void> {
  for (const node of removedNodes) {
    if (node.type !== 'code') continue;
    const basename = path.basename(node.id);

    const candidates = await wiki.search(basename);
    for (const page of candidates) {
      const mentionsFile = page.content.includes(node.id) || page.content.includes(basename)
        || page.links.some(l => l === node.id || l === basename);
      if (mentionsFile) {
        await wiki.markStale(page.title, `Source file '${node.id}' was deleted from the repository (detected via dependency-graph diff).`);
      }
    }
  }
}

function summarizeDiffForPrompt(diff: GraphDiff, graph: RepositoryGraph): string {
  const lines: string[] = [];

  const changedCodeNodes = diff.newNodes
    .filter(n => n.type === 'code')
    .map(n => ({ node: n, edgeCount: graph.getEdgesFrom(n.id).length }))
    .sort((a, b) => b.edgeCount - a.edgeCount);

  if (changedCodeNodes.length > 0) {
    lines.push('### New/Changed Files');
    for (const { node } of changedCodeNodes.slice(0, 25)) {
      const edges = graph.getEdgesFrom(node.id);
      const imports = edges.filter(e => e.type === 'imports').map(e => e.target);
      const invokes = edges.filter(e => e.type === 'invokes').map(e => e.target);
      const parts = [node.id];
      if (imports.length) parts.push(`imports: ${imports.slice(0, 5).join(', ')}`);
      if (invokes.length) parts.push(`invokes: ${invokes.slice(0, 5).join(', ')}`);
      lines.push(`- ${parts.join(' — ')}`);
    }
  }

  const removedFiles = diff.removedNodes.filter(n => n.type === 'code');
  if (removedFiles.length > 0) {
    lines.push('', '### Removed Files');
    for (const node of removedFiles.slice(0, 25)) {
      lines.push(`- ${node.id}`);
    }
  }

  if (diff.newEdges.length > 0) {
    lines.push('', '### New Relationships');
    for (const edge of diff.newEdges.slice(0, 40)) {
      lines.push(`- ${edge.source} --${edge.type}--> ${edge.target}`);
    }
  }

  const summary = lines.join('\n');
  return summary.length > MAX_DIFF_SUMMARY_CHARS
    ? summary.slice(0, MAX_DIFF_SUMMARY_CHARS) + '\n... (truncated)'
    : summary;
}

async function findCandidatePages(wiki: WikiMemory, diff: GraphDiff, graph: RepositoryGraph): Promise<WikiPage[]> {
  const keywords = new Set<string>();
  for (const node of [...diff.newNodes, ...diff.removedNodes]) {
    if (node.type !== 'code') continue;
    keywords.add(path.basename(node.id, path.extname(node.id)));
    const exports: string[] = node.metadata?.exports || [];
    for (const sym of exports.slice(0, 2)) keywords.add(sym);
    if (keywords.size >= MAX_CANDIDATE_KEYWORDS) break;
  }

  const seen = new Map<string, WikiPage>();
  for (const keyword of Array.from(keywords).slice(0, MAX_CANDIDATE_KEYWORDS)) {
    const results = await wiki.search(keyword);
    for (const page of results) {
      if (!seen.has(page.title)) seen.set(page.title, page);
    }
    if (seen.size >= MAX_CANDIDATE_PAGES) break;
  }

  return Array.from(seen.values()).slice(0, MAX_CANDIDATE_PAGES);
}

/**
 * Parses and validates raw LLM output before it's trusted enough to reach wiki.write().
 * Fails closed (returns []) on any malformed input rather than throwing — this is the
 * trust boundary for model output, so it must never let an invalid page through.
 */
export function parseAndValidateDecisions(raw: string, candidateTitles: Set<string>): WikiMaintenanceDecision[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const lowerCandidates = new Map(Array.from(candidateTitles).map(t => [t.toLowerCase(), t]));
  const decisions: WikiMaintenanceDecision[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const content = typeof item.content === 'string' ? item.content.trim() : '';
    if (!title || !content) continue;
    if (title.length > MAX_TITLE_LENGTH) continue;
    if (Buffer.byteLength(content, 'utf-8') > MAX_PAGE_BODY_BYTES) continue;

    const tags = Array.isArray(item.tags) ? item.tags.filter((t: any) => typeof t === 'string') : [];
    const rawLinks = Array.isArray(item.links) ? item.links.filter((l: any) => typeof l === 'string') : [];
    const links = rawLinks
      .map((l: string) => lowerCandidates.get(l.toLowerCase()))
      .filter((l: string | undefined): l is string => !!l);

    decisions.push({ title, content, tags, links });
  }

  return decisions;
}

export async function decideWikiUpdates(params: {
  workspaceRoot: string;
  wiki: WikiMemory;
  diff: GraphDiff;
  graph: RepositoryGraph;
}): Promise<WikiMaintenanceDecision[]> {
  const { wiki, diff, graph } = params;

  if (diff.newNodes.length === 0 && diff.removedNodes.length === 0 && diff.newEdges.length === 0 && diff.removedEdges.length === 0) {
    return [];
  }

  const diffSummary = summarizeDiffForPrompt(diff, graph);
  if (!diffSummary.trim()) return [];

  const candidatePages = await findCandidatePages(wiki, diff, graph);
  const candidateTitles = new Set(candidatePages.map(p => p.title));

  const candidateBlock = candidatePages.length > 0
    ? candidatePages.map(p => `- "${p.title}" (tags: ${p.tags.join(', ') || 'none'}) — ${p.content.split('\n')[0].slice(0, 100)}`).join('\n')
    : '(no related pages found)';

  const prompt = [
    'You are maintaining a project wiki. Below is a summary of what changed in the codebase since the last wiki sync, plus a list of existing wiki pages that may be related.',
    'Decide what wiki pages should be created or updated to reflect these changes. Only propose pages for genuinely significant structural/architectural changes (new modules, new cross-file relationships, removed modules) — skip trivial/cosmetic diffs. If nothing is significant, return an empty array.',
    '',
    '## Repository Changes Since Last Wiki Sync',
    diffSummary,
    '',
    '## Candidate Existing Wiki Pages (reference by exact title only)',
    candidateBlock,
    '',
    'Return ONLY a JSON array, each element:',
    '{ "title": "short descriptive title", "content": "wiki page body in markdown, under 3000 characters", "tags": ["code", ...], "links": ["<exact title from candidate list above>", ...] }',
    'Return [] if no update is warranted.'
  ].join('\n');

  try {
    const registry = ProviderRegistry.getInstance();
    const provider = registry.getAvailableProviders().find(p => p.id !== 'siliconflow') || registry.getProvider('gemini');
    if (!provider) return [];

    const response = await provider.chat({
      model: provider.models[0]?.id,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const content = response.choices?.[0]?.message?.content;
    const rawText = typeof content === 'string' ? content : '';
    if (!rawText) return [];

    return parseAndValidateDecisions(rawText, candidateTitles);
  } catch (err) {
    console.error('[wiki-maintainer] RAG decision call failed:', err);
    return [];
  }
}

/**
 * Entry point: gate → diff → stale-marking → RAG decision → write → persist meta.
 * Never throws — all failures are caught and logged; on failure the meta file is left
 * untouched so the next trigger retries, rather than silently going stale forever
 * (the exact failure mode resolvePdfRef's PDF-index cache has).
 */
export async function runWikiMaintenance(workspaceRoot: string, wsHash?: string): Promise<void> {
  try {
    const { WorkspaceScanner } = await import('../cache/workspace.js');
    const resolvedWsHash = wsHash || await new WorkspaceScanner(workspaceRoot).getWorkspaceHash(workspaceRoot);

    const gate = await shouldRunWikiMaintenance(workspaceRoot, resolvedWsHash);
    if (!gate.run) return;

    const graphPath = path.join(workspaceRoot, '.free-llm-mcp', 'repo_graph.json');
    const newGraphData = await readJsonSafe(graphPath);
    if (!newGraphData) return; // nothing indexed yet for this workspace

    const newGraph = RepositoryGraph.deserialize(workspaceRoot, newGraphData);

    const prevGraphData = await readJsonSafe(prevGraphPathFor(workspaceRoot));
    const oldGraph = prevGraphData ? RepositoryGraph.deserialize(workspaceRoot, prevGraphData) : null;

    const diff = diffGraphs(oldGraph, newGraph);
    const hasChanges = diff.newNodes.length > 0 || diff.removedNodes.length > 0 || diff.newEdges.length > 0 || diff.removedEdges.length > 0;
    if (!hasChanges) {
      // Graph is unchanged (e.g. repo-graph rebuild was itself cache-hit-skipped this
      // request) — nothing to do, but still worth persisting meta so we don't re-check
      // the (cheap) condition gate needlessly on every subsequent request.
      await persistMeta(workspaceRoot, gate);
      return;
    }

    const wiki = memoryManager.getWiki(resolvedWsHash);

    await markStaleForRemovedFiles(wiki, diff.removedNodes);

    const decisions = await decideWikiUpdates({ workspaceRoot, wiki, diff, graph: newGraph });
    for (const decision of decisions) {
      await wiki.write(decision.title, decision.content, decision.tags, decision.links);
    }

    const prevGraphPath = prevGraphPathFor(workspaceRoot);
    await fs.mkdir(path.dirname(prevGraphPath), { recursive: true });
    await withFileLock(prevGraphPath, async () => {
      await writeFileAtomic(prevGraphPath, JSON.stringify(newGraph.serialize(), null, 2));
    }, LOCK_WAIT_MS);

    await persistMeta(workspaceRoot, gate);
  } catch (err) {
    console.error('[wiki-maintainer] runWikiMaintenance failed:', err);
  }
}

async function persistMeta(workspaceRoot: string, gate: { freshCommitHash?: string; freshFingerprint?: string }): Promise<void> {
  const meta: WikiMaintenanceMeta = {
    lastSyncCommitHash: gate.freshCommitHash || '',
    lastSyncFileFingerprint: gate.freshFingerprint,
    lastSyncedAt: Date.now(),
    hasGit: !!gate.freshCommitHash,
  };
  const metaPath = metaPathFor(workspaceRoot);
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await withFileLock(metaPath, async () => {
    await writeFileAtomic(metaPath, JSON.stringify(meta, null, 2));
  }, LOCK_WAIT_MS);
}
