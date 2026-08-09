import fetch from 'node-fetch';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveConfigDir } from '../utils/config-path.js';
import { listHermesSkills, findHermesSkill, loadHermesSkillContent, searchHermesSkills } from '../hermes/loader.js';

const SKILL_INDEX_URL = 'https://sickn33.github.io/agentic-awesome-skills/skills.json';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/main';
const API_BASE_URL = 'https://api.github.com/repos/sickn33/agentic-awesome-skills/contents';

interface SkillIndexEntry {
  id?: string;
  name?: string;
  path?: string;
  description?: string;
  plugin?: {
    setup?: {
      type?: string;
      summary?: string;
      docs?: string | null;
    };
  };
}

export interface LoadSkillPromptInput {
  type: 'load' | 'search' | 'list';
  keywords?: string[];
  name?: string;
  skill?: string;
  workspaceDir?: string;
  /** 'hermes' searches/loads the bundled external/hermes/ skill set instead of the agentic-awesome index. */
  source?: 'agentic-awesome' | 'hermes';
}

export interface LoadSkillPromptResult {
  success: boolean;
  skills?: { name: string, description: string }[];
  filePath?: string;
  error?: string;
  skill?: string;
  description?: string;
  terminalSetupHint?: string;
  prompt?: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return await response.text();
}

async function getBaseDir(workspaceDir?: string): Promise<string> {
  if (workspaceDir) {
    return resolveConfigDir(workspaceDir);
  }
  return path.join(os.homedir(), '.free-llm-mcp');
}

async function getLocalSkillsIndex(configDir: string): Promise<SkillIndexEntry[]> {
  const indexFile = path.join(configDir, 'skills.json');

  try {
    const stats = await fs.stat(indexFile);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - stats.mtimeMs > oneDay) {
      return await refreshSkillsIndex(configDir, indexFile);
    }

    const content = await fs.readFile(indexFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return await refreshSkillsIndex(configDir, indexFile);
  }
}

async function refreshSkillsIndex(configDir: string, indexFile: string): Promise<SkillIndexEntry[]> {
  await fs.mkdir(configDir, { recursive: true });
  const index = await fetchJson<SkillIndexEntry[]>(SKILL_INDEX_URL);
  await fs.writeFile(indexFile, JSON.stringify(index, null, 2));
  return index;
}

async function searchSkills(keywords: string[], baseDir: string): Promise<{ name: string, description: string }[]> {
  const index = await getLocalSkillsIndex(baseDir);
  if (!keywords || keywords.length === 0) return [];

  const scored = index.map(entry => {
    let score = 0;
    const target = `${entry.id} ${entry.name} ${entry.description}`.toLowerCase();
    keywords.forEach(k => {
      if (target.includes(normalize(k))) score++;
    });
    return { 
      name: entry.name || entry.id || '', 
      description: entry.description || '', 
      score 
    };
  })
  .filter(e => e.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map(e => ({ name: e.name, description: e.description }));
}

async function fetchAllFiles(skillPath: string, accumulator: { path: string, content: string }[] = []): Promise<{ path: string, content: string }[]> {
  const response = await fetch(`${API_BASE_URL}/${skillPath}`);
  if (!response.ok) throw new Error(`Failed to fetch contents of ${skillPath}: HTTP ${response.status}`);
  const items = await response.json() as any[];

  for (const item of items) {
    if (item.type === 'dir') {
      await fetchAllFiles(item.path, accumulator);
    } else if (item.type === 'file') {
      const ext = item.name.split('.').pop()?.toLowerCase();
      const textExtensions = ['md', 'txt', 'js', 'ts', 'py', 'sh', 'json', 'yml', 'yaml', 'jsx', 'tsx'];
      if (textExtensions.includes(ext || '')) {
        const content = await fetchText(item.download_url);
        accumulator.push({ path: item.path, content });
      }
    }
  }
  return accumulator;
}

async function loadHermesSkillPrompt(input: LoadSkillPromptInput): Promise<LoadSkillPromptResult> {
  if (input.type === 'list') {
    const skills = await listHermesSkills();
    return { success: true, skills: skills.map(s => ({ name: s.name, description: s.description })) };
  }

  if (input.type === 'search') {
    const results = await searchHermesSkills(input.keywords || []);
    return { success: true, skills: results.map(s => ({ name: s.name, description: s.description })) };
  }

  if (input.type === 'load') {
    const name = input.name || input.skill || '';
    const found = await findHermesSkill(name);
    if (!found) {
      const keywords = name.split(/\s+/).filter(Boolean);
      const results = await searchHermesSkills(keywords);
      return { success: true, skills: results.map(s => ({ name: s.name, description: s.description })) };
    }

    const loaded = await loadHermesSkillContent(found.id);
    if (!loaded) {
      return { success: false, error: `Hermes skill "${name}" was found in the manifest but its SKILL.md is missing on disk — run \`npm run fetch-hermes\`.` };
    }

    return {
      success: true,
      skill: found.name,
      description: found.description,
      prompt: loaded.content,
    };
  }

  return { success: false, error: 'Invalid type for source "hermes". Use "load", "search", or "list".' };
}

export async function loadSkillPrompt(input: LoadSkillPromptInput): Promise<LoadSkillPromptResult> {
  try {
    if (input.source === 'hermes') {
      return await loadHermesSkillPrompt(input);
    }

    const configDir = await getBaseDir(input.workspaceDir);

  if (input.type === 'search') {
    const rawKeywords = (input.keywords && input.keywords.length > 0)
      ? input.keywords
      : (input.name || input.skill || '').split(/\s+/).filter(k => k.trim().length > 0);

    if (rawKeywords.length === 0) {
      // Empty keywords array provided — return empty result immediately to avoid context bloat
      return { success: true, skills: [] };
    }

    if (input.source === 'hermes') {
      const results = await searchHermesSkills(rawKeywords);
      return { success: true, skills: results.map(s => ({ name: s.name, description: s.description })) };
    }

    // Try local/online index first, then fallback to bundled Hermes skills
    const localResults = await searchSkills(rawKeywords, configDir);
    if (localResults.length > 0) {
      return { success: true, skills: localResults };
    }

    const hermesResults = await searchHermesSkills(rawKeywords);
    return { success: true, skills: hermesResults.map(s => ({ name: s.name, description: s.description })) };
  }

    if (input.type === 'load') {
      const name = input.name || '';
      const index = await getLocalSkillsIndex(configDir);
      const found = index.find(e => normalize(e.name || '') === normalize(name) || normalize(e.id || '') === normalize(name));

      if (!found || !found.path) {
        const keywords = name.split(/\s+/).filter(k => k.length > 0);
        const results = await searchSkills(keywords, configDir);
        return { success: true, skills: results };
      }

       const skillDir = path.join(configDir, 'skills', found.id || found.name || name);
       await fs.mkdir(skillDir, { recursive: true });

       const skillPath = found.path.replace(/^\/+/, '');
       const files = await fetchAllFiles(skillPath);

       for (const file of files) {
         const relativePath = file.path.replace(`${skillPath}/`, '');
         const fullPath = path.join(skillDir, relativePath);
         await fs.mkdir(path.dirname(fullPath), { recursive: true });
         await fs.writeFile(fullPath, file.content);
       }

       const skillMdPath = path.join(skillDir, 'SKILL.md');
       const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');

       return { 
         success: true, 
         filePath: skillMdPath,
         skill: found.name || found.id || name,
         description: found.description || '',
         prompt: skillMdContent
       };
     }

    return { success: false, error: 'Invalid type. Use "load" or "search".' };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown error occurred.' };
  }
}
