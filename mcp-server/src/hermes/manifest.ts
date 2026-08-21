import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { HermesManifest, HermesSkillEntry } from './types.js';

// Resolved relative to this file (not process.cwd()) — mirrors the
// external/agent-prompt/prompt.json convention in
// src/pipeline/middlewares/prompts.ts. A process.cwd()-based path breaks the
// moment the MCP server is spawned from a different working directory (e.g.
// a client launching it via an absolute stdio command), which is exactly the
// kind of silent-breakage bug PersistenceManager.ts's resolvePath() comment
// already documents for a different subsystem. external/hermes/ lives at the
// repo root (sibling to external/agent-prompt/), not under mcp-server/ — this
// file is mcp-server/src/hermes/manifest.ts, so it's three levels up from src/.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const HERMES_ROOT = path.resolve(
  process.env.HERMES_SKILLS_PATH ?? path.join(__dirname, '../../../external/hermes'),
);
const MANIFEST_PATH = path.join(HERMES_ROOT, 'manifest.json');

// In-memory cache keyed on the manifest file's mtime — same pattern as
// prompts.ts's cachedPromptData/lastMtime — so a hot path like execute-skill's
// per-request Hermes auto-detect doesn't re-read+re-parse manifest.json on
// every single call.
let cachedManifest: HermesManifest | null = null;
let cachedMtimeMs = 0;

/** Parses SKILL.md YAML frontmatter, including nested metadata fields. */
export function extractFrontmatter(content: string): { fields: Record<string, any>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: content };

  const parsed = parseYaml(match[1]);
  const fields = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  return { fields, body: match[2] };
}

/** Scans external/hermes/<category>/<skill>/SKILL.md, parses frontmatter, writes manifest.json. */
export async function generateManifest(): Promise<HermesManifest> {
  const skills: HermesSkillEntry[] = [];

  if (await fs.pathExists(HERMES_ROOT)) {
    const categories = (await fs.readdir(HERMES_ROOT, { withFileTypes: true }))
      .filter(d => d.isDirectory());

    for (const categoryDir of categories) {
      const categoryPath = path.join(HERMES_ROOT, categoryDir.name);
      const skillDirs = (await fs.readdir(categoryPath, { withFileTypes: true }))
        .filter(d => d.isDirectory());

      for (const skillDir of skillDirs) {
        const skillMdPath = path.join(categoryPath, skillDir.name, 'SKILL.md');
        if (!await fs.pathExists(skillMdPath)) continue;

        const raw = await fs.readFile(skillMdPath, 'utf-8');
        const { fields } = extractFrontmatter(raw);
        skills.push({
          id: skillDir.name,
          category: categoryDir.name,
          name: (fields.name as string) || skillDir.name,
          description: (fields.description as string) || '',
          tags: Array.isArray(fields.tags)
            ? fields.tags
            : (fields.tags ? [fields.tags as string] : (Array.isArray(fields.metadata?.hermes?.tags) ? fields.metadata.hermes.tags : [])),
          path: `${categoryDir.name}/${skillDir.name}`,
        });
      }
    }
  }

  const manifest: HermesManifest = { generatedAt: new Date().toISOString(), skills };
  await fs.ensureDir(HERMES_ROOT);
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const stat = await fs.stat(MANIFEST_PATH);
  cachedManifest = manifest;
  cachedMtimeMs = stat.mtimeMs;
  return manifest;
}

/** Resets the in-memory manifest cache — used by tests/generateManifest() callers that need a guaranteed re-read. */
export function resetManifestCache(): void {
  cachedManifest = null;
  cachedMtimeMs = 0;
}

export async function loadManifest(): Promise<HermesManifest> {
  try {
    const stat = await fs.stat(MANIFEST_PATH);
    if (cachedManifest && stat.mtimeMs === cachedMtimeMs) {
      return cachedManifest;
    }
    const raw = await fs.readFile(MANIFEST_PATH, 'utf-8');
    const manifest = JSON.parse(raw) as HermesManifest;
    cachedManifest = manifest;
    cachedMtimeMs = stat.mtimeMs;
    return manifest;
  } catch {
    return generateManifest();
  }
}
