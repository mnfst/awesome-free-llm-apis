import fs from 'fs-extra';
import path from 'node:path';
import { HERMES_ROOT, loadManifest } from './manifest.js';
import type { HermesSkillContent, HermesSkillEntry } from './types.js';

export async function listHermesSkills(): Promise<HermesSkillEntry[]> {
  const manifest = await loadManifest();
  return manifest.skills;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function findHermesSkill(nameOrId: string): Promise<HermesSkillEntry | null> {
  const skills = await listHermesSkills();
  const target = normalize(nameOrId);
  return skills.find(s => normalize(s.id) === target || normalize(s.name) === target) || null;
}

export async function searchHermesSkills(keywords: string[]): Promise<HermesSkillEntry[]> {
  if (!keywords || keywords.length === 0) return [];
  const skills = await listHermesSkills();
  const normKeywords = keywords.map(normalize);

  return skills
    .map(s => {
      const target = `${s.id} ${s.name} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase();
      const score = normKeywords.filter(k => target.includes(k)).length;
      return { skill: s, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(e => e.skill);
}

async function loadReferenceFiles(skillDir: string): Promise<Array<{ path: string; content: string }>> {
  const refs: Array<{ path: string; content: string }> = [];
  const refsDir = path.join(skillDir, 'references');
  if (!await fs.pathExists(refsDir)) return refs;

  const walk = async (dir: string, base: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.join(base, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        try {
          const content = await fs.readFile(full, 'utf-8');
          refs.push({ path: rel, content });
        } catch { /* skip unreadable/binary files */ }
      }
    }
  };
  await walk(refsDir, 'references');
  return refs;
}

export async function loadHermesSkillContent(skillId: string): Promise<HermesSkillContent | null> {
  const skill = await findHermesSkill(skillId);
  if (!skill) return null;

  const skillDir = path.join(HERMES_ROOT, skill.path);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!await fs.pathExists(skillMdPath)) return null;

  const content = await fs.readFile(skillMdPath, 'utf-8');
  const references = await loadReferenceFiles(skillDir);
  return { skill, content, references };
}
