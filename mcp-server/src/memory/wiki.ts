import os from 'os';
import { promises as fs } from 'fs';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { withFileLock } from '../utils/file-lock.js';

// See long-term.ts/vector.ts for the same rationale.
const LOCK_WAIT_MS = 30000;

export interface WikiPage {
  title: string;
  created: string;
  updated: string;
  confidence: number;
  tier: 'episodic' | 'semantic';
  tags: string[];
  links: string[];
  adr_ref?: string;
  content: string;
}

const PERSONA_TAGS: Record<string, string[]> = {
  coder: ['code', 'adr', 'ts', 'py', 'js', 'rust', 'architecture', 'backend', 'frontend'],
  researcher: ['study', 'pdf', 'paper', 'citation', 'research'],
  marketer: ['seo', 'marketing', 'campaign', 'strategy', 'keyword'],
  seo: ['seo', 'marketing', 'campaign', 'strategy', 'keyword'],
  student: ['study', 'explain', 'textbook', 'learning'],
  planner: ['plan', 'roadmap', 'milestone', 'task', 'phase'],
  debugger: ['debug', 'error', 'exception', 'stacktrace', 'leak', 'crash', 'issue', 'ts', 'schema', 'venv', 'node_modules', 'variables'],
  cyber: ['cyber', 'security', 'exploit', 'cve', 'pentest', 'nmap', 'owasp', 'ctf', 'vulnerability', 'malware']
};

const DECISION_PATTERNS = [
  /decided to/i,
  /chose\s+.*\s+over\s+.*/i,
  /we\s+use\s+.*\s+because/i,
  /decision:/i
];

const MAX_WIKI_PAGES = 500;
const MAX_PAGE_SIZE = 4096; // 4KB

function getFilename(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.md';
}

function parseFrontmatter(fileContent: string): { frontmatter: Record<string, any>, body: string } {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent };
  }
  const yamlLines = match[1].split('\n');
  const body = match[2];
  const frontmatter: Record<string, any> = {};
  for (const line of yamlLines) {
    const parts = line.split(':');
    if (parts.length < 2) continue;
    const key = parts[0].trim();
    let val = parts.slice(1).join(':').trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      frontmatter[key] = val
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else if (val === 'true') {
      frontmatter[key] = true;
    } else if (val === 'false') {
      frontmatter[key] = false;
    } else {
      const num = Number(val);
      if (!isNaN(num) && val !== '') {
        frontmatter[key] = num;
      } else {
        frontmatter[key] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { frontmatter, body };
}

function stringifyFrontmatter(frontmatter: Record<string, any>, body: string): string {
  let lines = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.join(', ')}]`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n\n' + body;
}

async function safeRename(src: string, dest: string, retries = 5, delay = 10): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rename(src, dest);
      return;
    } catch (err: any) {
      if ((err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

async function safeUnlink(filePath: string, retries = 5, delay = 10): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath);
      return;
    } catch (err: any) {
      if ((err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

export class WikiMemory {
  private wikiDir: string;

  constructor(workspaceHash: string, customBaseDir?: string) {
    const base = customBaseDir || path.join(os.homedir(), '.free-llm-mcp', 'wiki');
    this.wikiDir = path.join(base, workspaceHash);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.wikiDir, { recursive: true });
  }

  // Keyed by title alone (not the full per-tags path) so every writer targeting the
  // same logical page contends for the same lock regardless of its `study` tag routing.
  private lockPathForTitle(title: string): string {
    return path.join(this.wikiDir, `${getFilename(title)}.opslock`);
  }

  private getPathForTitle(title: string, tags: string[] = []): string {
    const filename = getFilename(title);
    if (tags.map(t => t.toLowerCase()).includes('study')) {
      return path.join(this.wikiDir, 'study', filename);
    }
    return path.join(this.wikiDir, filename);
  }

  private async getWikiFiles(): Promise<string[]> {
    let results: string[] = [];
    const scan = async (dir: string) => {
      try {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const file of list) {
          const res = path.resolve(dir, file.name);
          if (file.isDirectory()) {
            if (file.name === 'adr') continue;
            await scan(res);
          } else if (file.name.endsWith('.md')) {
            results.push(res);
          }
        }
      } catch {
        // ignore
      }
    };
    await scan(this.wikiDir);
    return results;
  }

  async read(title: string): Promise<WikiPage | null> {
    const filename = getFilename(title);
    const paths = [
      path.join(this.wikiDir, filename),
      path.join(this.wikiDir, 'study', filename)
    ];

    for (const p of paths) {
      try {
        if (existsSync(p)) {
          const raw = await fs.readFile(p, 'utf-8');
          const { frontmatter, body } = parseFrontmatter(raw);
          return {
            title: frontmatter.title || title,
            created: frontmatter.created || new Date().toISOString(),
            updated: frontmatter.updated || new Date().toISOString(),
            confidence: typeof frontmatter.confidence === 'number' ? frontmatter.confidence : 0.5,
            tier: frontmatter.tier || 'episodic',
            tags: frontmatter.tags || [],
            links: (frontmatter.links || []).map((l: string) => l.replace(/^\[\[|\]\]$/g, '')),
            adr_ref: frontmatter.adr_ref,
            content: body.trim()
          };
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  async list(): Promise<Array<Pick<WikiPage, 'title' | 'tier' | 'confidence' | 'tags' | 'updated' | 'links'>>> {
    const files = await this.getWikiFiles();
    const pages: Array<Pick<WikiPage, 'title' | 'tier' | 'confidence' | 'tags' | 'updated' | 'links'>> = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(f, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw);
        pages.push({
          title: frontmatter.title || path.basename(f, '.md'),
          tier: frontmatter.tier || 'episodic',
          confidence: typeof frontmatter.confidence === 'number' ? frontmatter.confidence : 0.5,
          tags: frontmatter.tags || [],
          updated: frontmatter.updated || '',
          links: (frontmatter.links || []).map((l: string) => l.replace(/^\[\[|\]\]$/g, ''))
        });
      } catch {
        // ignore
      }
    }
    pages.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    return pages;
  }

  private async writePage(
    title: string,
    content: string,
    tags: string[],
    links: string[],
    confidence: number,
    adr_ref?: string
  ): Promise<WikiPage> {
    const existing = await this.read(title);
    const created = existing ? existing.created : new Date().toISOString();
    const updated = new Date().toISOString();
    const tier = confidence >= 0.8 ? 'semantic' : 'episodic';

    const frontmatter: Record<string, any> = {
      title,
      created,
      updated,
      confidence: Math.round(confidence * 100) / 100,
      tier,
      tags,
      links: links.map(l => l.startsWith('[[') && l.endsWith(']]') ? l : `[[${l}]]`)
    };
    if (adr_ref) {
      frontmatter.adr_ref = adr_ref;
    }

    const raw = stringifyFrontmatter(frontmatter, content);
    if (Buffer.byteLength(raw, 'utf-8') > MAX_PAGE_SIZE) {
      throw new Error(`Wiki page exceeds maximum size of ${MAX_PAGE_SIZE} bytes.`);
    }

    const targetPath = this.getPathForTitle(title, tags);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Atomic write
    const tmpPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
    await fs.writeFile(tmpPath, raw, 'utf-8');
    await safeRename(tmpPath, targetPath);

    await this.enforcePageLimit();

    return {
      title,
      created,
      updated,
      confidence,
      tier,
      tags,
      links,
      adr_ref,
      content
    };
  }

  // write()/reinforce()/recordFailure() are all read-modify-write cycles keyed on the
  // page's *current* confidence (e.g. "+0.15 from whatever it is now") — two concurrent
  // calls to the same title (plausible: multiple subtask completions touching the same
  // page, or agentic + wiki-maintainer both writing it around the same time) that both
  // read before either writes lose one of the two updates entirely (last writer wins,
  // silently). Locking the whole read-compute-write cycle per title serializes that.

  async write(title: string, content: string, tags: string[] = [], links: string[] = []): Promise<WikiPage> {
    await this.ensureDir();
    return withFileLock(this.lockPathForTitle(title), async () => {
      const existing = await this.read(title);
      let confidence = existing ? Math.min(1.0, existing.confidence + 0.15) : 0.5;

      // Check if decision pattern is detected to auto-trigger ADR
      let adr_ref = existing?.adr_ref;
      if (confidence >= 0.85 && !adr_ref) {
        const hasDecisionPattern = DECISION_PATTERNS.some(pat => pat.test(content));
        if (hasDecisionPattern) {
          adr_ref = await this.createADR(title, content);
        }
      }

      return this.writePage(title, content, tags, links, confidence, adr_ref);
    }, LOCK_WAIT_MS);
  }

  async reinforce(title: string, delta = 0.15): Promise<WikiPage | null> {
    return withFileLock(this.lockPathForTitle(title), async () => {
      const existing = await this.read(title);
      if (!existing) return null;
      const confidence = Math.min(1.0, existing.confidence + delta);
      return this.writePage(title, existing.content, existing.tags, existing.links, confidence, existing.adr_ref);
    }, LOCK_WAIT_MS);
  }

  async recordFailure(title: string, reason: string, delta = 0.15): Promise<WikiPage | null> {
    return withFileLock(this.lockPathForTitle(title), async () => {
      const existing = await this.read(title);
      if (!existing) return null;
      const confidence = Math.max(0, existing.confidence - delta);
      const failureNote = `\n\n> ⚠️ Failure recorded (${new Date().toISOString().split('T')[0]}): ${reason}`;
      const content = existing.content.includes(failureNote.trim()) ? existing.content : existing.content + failureNote;
      return this.writePage(title, content, existing.tags, existing.links, confidence, existing.adr_ref);
    }, LOCK_WAIT_MS);
  }

  private async enforcePageLimit(): Promise<void> {
    const files = await this.getWikiFiles();
    if (files.length <= MAX_WIKI_PAGES) return;

    const pages: Array<{ path: string; confidence: number; updated: number }> = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(f, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw);
        pages.push({
          path: f,
          confidence: typeof frontmatter.confidence === 'number' ? frontmatter.confidence : 0.5,
          updated: frontmatter.updated ? new Date(frontmatter.updated).getTime() : 0
        });
      } catch {
        // ignore
      }
    }

    // Sort by confidence ascending, then updated time ascending
    pages.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return a.confidence - b.confidence;
      }
      return a.updated - b.updated;
    });

    // Evict all excess pages
    const excessCount = files.length - MAX_WIKI_PAGES;
    const toEvict = pages.slice(0, excessCount);
    for (const p of toEvict) {
      try {
        await safeUnlink(p.path);
      } catch {
        // ignore
      }
    }
  }

  async search(query: string, persona?: string): Promise<WikiPage[]> {
    const files = await this.getWikiFiles();
    const results: Array<{ page: WikiPage; score: number }> = [];
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

    for (const f of files) {
      try {
        const raw = await fs.readFile(f, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(raw);
        const title = frontmatter.title || '';
        const tags = frontmatter.tags || [];
        const links = (frontmatter.links || []).map((l: string) => l.replace(/^\[\[|\]\]$/g, ''));
        const content = body;

        const page: WikiPage = {
          title,
          created: frontmatter.created || new Date().toISOString(),
          updated: frontmatter.updated || new Date().toISOString(),
          confidence: typeof frontmatter.confidence === 'number' ? frontmatter.confidence : 0.5,
          tier: frontmatter.tier || 'episodic',
          tags,
          links,
          adr_ref: frontmatter.adr_ref,
          content: body.trim()
        };

        // Calculate query match score
        let matchScore = 0;
        if (queryTerms.length === 0) {
          matchScore = 1.0;
        } else {
          for (const term of queryTerms) {
            if (title.toLowerCase().includes(term)) matchScore += 10;
            for (const tag of tags) {
              if (tag.toLowerCase().includes(term)) matchScore += 5;
            }
            if (content.toLowerCase().includes(term)) matchScore += 1;
          }
        }

        if (matchScore > 0) {
          const personaWeight = getPersonaWeight(tags, content, persona);
          const totalScore = personaWeight * page.confidence * matchScore;
          results.push({ page, score: totalScore });
        }
      } catch {
        // ignore
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.page);
  }

  async resolveLink(linkText: string): Promise<string> {
    const page = await this.read(linkText);
    if (!page) return '';

    const lines = page.content.split('\n').map(l => l.trim());
    const summaryIdx = lines.findIndex(l => /^##\s+Summary/i.test(l));
    if (summaryIdx !== -1) {
      const summaryLines: string[] = [];
      for (let i = summaryIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^#/.test(line)) break;
        if (line !== '') {
          summaryLines.push(line);
          if (summaryLines.length === 3) break;
        }
      }
      if (summaryLines.length > 0) return summaryLines.join('\n');
    }

    const nonHeaders = lines.filter(l => l !== '' && !/^#/.test(l));
    return nonHeaders.slice(0, 3).join('\n');
  }

  async markStale(title: string, reason: string): Promise<void> {
    const page = await this.read(title);
    if (!page) return;

    const staleHeader = `## ⚠️ Stale — Source Deleted\nReason: ${reason}\n\n`;
    const newContent = staleHeader + page.content;

    await this.writePage(title, newContent, page.tags, page.links, 0.0, page.adr_ref);
  }

  async consolidate(): Promise<void> {
    const files = await this.getWikiFiles();
    for (const f of files) {
      try {
        const raw = await fs.readFile(f, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(raw);
        const confidence = frontmatter.confidence || 0.5;
        if (confidence >= 0.8 && frontmatter.tier !== 'semantic') {
          frontmatter.tier = 'semantic';
          const updatedRaw = stringifyFrontmatter(frontmatter, body);
          // Atomic write
          const tmpPath = `${f}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
          await fs.writeFile(tmpPath, updatedRaw, 'utf-8');
          await safeRename(tmpPath, f);
        }
      } catch {
        // ignore
      }
    }
  }

  private async createADR(title: string, content: string): Promise<string> {
    const adrDir = path.join(this.wikiDir, 'adr');
    await fs.mkdir(adrDir, { recursive: true });

    let adrNumber = 1;
    try {
      const files = await fs.readdir(adrDir);
      const nums = files
        .map(f => {
          const m = f.match(/ADR-(\d+)\.md/i);
          return m ? parseInt(m[1], 10) : 0;
        });
      if (nums.length > 0) {
        adrNumber = Math.max(...nums) + 1;
      }
    } catch {
      // ignore
    }

    const adrId = `ADR-${String(adrNumber).padStart(3, '0')}`;
    const adrPath = path.join(adrDir, `${adrId}.md`);

    const adrContent = `# ${adrId}: ${title}

**Status**: Accepted  
**Date**: ${new Date().toISOString().split('T')[0]}  
**Context**: ${title} implementation details.  
**Decision**: ${title} was chosen/implemented.  
**Consequences**: Documented in [[${title}]].  

## Content
${content}
`;
    const tmpPath = `${adrPath}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
    await fs.writeFile(tmpPath, adrContent, 'utf-8');
    await safeRename(tmpPath, adrPath);

    return adrId;
  }

  async recordADR(decision: string, context: string, rationale: string): Promise<string> {
    const adrDir = path.join(this.wikiDir, 'adr');
    await fs.mkdir(adrDir, { recursive: true });

    let adrNumber = 1;
    try {
      const files = await fs.readdir(adrDir);
      const nums = files
        .map(f => {
          const m = f.match(/ADR-(\d+)\.md/i);
          return m ? parseInt(m[1], 10) : 0;
        });
      if (nums.length > 0) {
        adrNumber = Math.max(...nums) + 1;
      }
    } catch {}

    const adrId = `ADR-${String(adrNumber).padStart(3, '0')}`;
    const adrPath = path.join(adrDir, `${adrId}.md`);

    const adrContent = `# ${adrId}: ${decision}

**Status**: Accepted  
**Date**: ${new Date().toISOString().split('T')[0]}  

## Context
${context}

## Decision
${decision}

## Rationale
${rationale}
`;
    const tmpPath = `${adrPath}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
    await fs.writeFile(tmpPath, adrContent, 'utf-8');
    await safeRename(tmpPath, adrPath);

    return adrId;
  }
}

function getPersonaWeight(tags: string[], content: string, persona?: string): number {
  if (!persona) return 1.0;
  const p = persona.toLowerCase();
  const targetTags = PERSONA_TAGS[p] || [];
  let matched = false;
  for (const t of tags) {
    if (targetTags.includes(t.toLowerCase())) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    for (const term of targetTags) {
      if (content.toLowerCase().includes(term)) {
        matched = true;
        break;
      }
    }
  }
  return matched ? 2.0 : 1.0;
}
