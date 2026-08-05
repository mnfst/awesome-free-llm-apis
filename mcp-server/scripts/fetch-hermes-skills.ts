#!/usr/bin/env node
/**
 * Downloads Hermes-Agent skills into external/hermes/ (offline-first —
 * bundled/version-controlled, not fetched at runtime) and regenerates
 * manifest.json. Run once via `npm run fetch-hermes`, then commit the
 * resulting external/hermes/ tree, per docs/plans/hermes-agent-skills.md.
 */
import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'node:path';
import { HERMES_ROOT, generateManifest } from '../src/hermes/manifest.js';

const REPO_SLUG = process.env.HERMES_SOURCE_REPO || 'nousresearch/hermes-agent';
const REPO_API_BASE = `https://api.github.com/repos/${REPO_SLUG}/contents`;
// Confirmed against the real repo (github.com/NousResearch/hermes-agent):
// skills live under a `skills/` prefix (e.g. `skills/creative/humanizer`), not
// at repo root — SKILL_PATHS below stays root-relative (category/skill, no
// `skills/` prefix) to match HermesSkillEntry.path's existing convention, and
// this prefix is joined on only for the actual GitHub API calls.
const SKILLS_ROOT_PATH = 'skills';
// Doc/config types plus common helper-script types skills ship alongside
// SKILL.md (e.g. research/arxiv's scripts/search_arxiv.py) — anything not in
// this list is silently dropped by fetchDirRecursive's extension filter, so
// keep it as broad as "plausibly a skill asset" rather than "plausibly text".
const TEXT_EXTENSIONS = ['md', 'txt', 'json', 'yml', 'yaml', 'py', 'sh', 'js', 'ts', 'mjs', 'cjs'];

// Category/skill paths to fetch, per docs/plans/hermes-agent-skills.md's
// "What Skills Are Included" table. Kept as a flat list (not auto-discovered)
// so a partial/renamed upstream repo doesn't silently pull in unrelated content
// — the real repo has additional categories (apple, autonomous-ai-agents,
// email, media, mlops, smart-home, social-media) not in this curated set.
const SKILL_PATHS = [
  'creative/humanizer',
  'github/codebase-inspection', 'github/github-auth', 'github/github-code-review',
  'github/github-issues', 'github/github-pr-workflow', 'github/github-repo-management',
  'note-taking/obsidian',
  'productivity/airtable', 'productivity/docx', 'productivity/google-workspace', 'productivity/maps',
  'productivity/nano-pdf', 'productivity/notion', 'productivity/ocr-and-documents', 'productivity/pdf',
  'productivity/powerpoint', 'productivity/teams-meeting-pipeline', 'productivity/xlsx',
  'research/llm-wiki', 'research/arxiv', 'research/blogwatcher', 'research/grounded-citations',
  'research/polymarket', 'research/research-paper-writing',
  'software-development/dogfood', 'software-development/hermes-agent-skill-authoring',
  'software-development/inspecting-hermes-desktop-dom', 'software-development/node-inspect-debugger',
  'software-development/plan', 'software-development/python-debugpy', 'software-development/requesting-code-review',
  'software-development/simplify-code', 'software-development/spike', 'software-development/systematic-debugging',
  'software-development/test-driven-development',
];

// One-time bootstrap only — external/hermes/ is committed to the repo and
// read locally at request time (src/hermes/loader.ts never hits the network).
// Unauthenticated GitHub API calls are capped at 60/hour; if this script 403s
// partway through, it's idempotent — wait for the rate-limit window to reset
// and re-run.
const GITHUB_HEADERS: Record<string, string> = { 'User-Agent': 'free-llm-mcp-hermes-fetch' };

/** apiPath is the full GitHub API contents path (includes the `skills/` prefix). */
async function fetchDirRecursive(apiPath: string, accumulator: { path: string; content: string }[] = []) {
  const response = await fetch(`${REPO_API_BASE}/${apiPath}`, {
    headers: GITHUB_HEADERS,
  });
  if (!response.ok) {
    console.warn(`[fetch-hermes] Skipping ${apiPath}: HTTP ${response.status}`);
    return accumulator;
  }
  const items = await response.json() as any[];
  for (const item of items) {
    if (item.type === 'dir') {
      await fetchDirRecursive(item.path, accumulator);
    } else if (item.type === 'file') {
      const ext = item.name.split('.').pop()?.toLowerCase();
      if (TEXT_EXTENSIONS.includes(ext || '')) {
        const fileRes = await fetch(item.download_url);
        if (fileRes.ok) accumulator.push({ path: item.path, content: await fileRes.text() });
      }
    }
  }
  return accumulator;
}

async function main() {
  await fs.ensureDir(HERMES_ROOT);
  let fetched = 0;

  for (const skillPath of SKILL_PATHS) {
    const apiSkillPath = `${SKILLS_ROOT_PATH}/${skillPath}`;
    try {
      const files = await fetchDirRecursive(apiSkillPath);
      if (files.length === 0) {
        console.warn(`[fetch-hermes] No files found for ${apiSkillPath} — skipping.`);
        continue;
      }

      for (const file of files) {
        // file.path is API-rooted (e.g. "skills/creative/humanizer/SKILL.md") —
        // strip the `skills/` prefix so the local layout matches HERMES_ROOT's
        // category/skill convention (external/hermes/creative/humanizer/...).
        const relativePath = file.path.replace(new RegExp(`^${SKILLS_ROOT_PATH}/`), '');
        const fullPath = path.join(HERMES_ROOT, relativePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, file.content);
      }
      fetched++;
      console.log(`[fetch-hermes] Fetched ${skillPath} (${files.length} files)`);
    } catch (err: any) {
      console.warn(`[fetch-hermes] Failed to fetch ${apiSkillPath}: ${err.message}`);
    }
  }

  const manifest = await generateManifest();
  console.log(`[fetch-hermes] Done. ${fetched}/${SKILL_PATHS.length} skills fetched, manifest has ${manifest.skills.length} entries.`);
}

main().catch(err => {
  console.error('[fetch-hermes] Fatal error:', err);
  process.exit(1);
});
