#!/usr/bin/env node
/**
 * @file fetch-cyber-tools.ts
 * @description Synchronizes tools_config.json from djmahe4/cyber-tools-index on GitHub to external/cyber-tools-index/.
 * Usage: npm run fetch-cyber-tools
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const CYBER_TOOLS_URL = 'https://raw.githubusercontent.com/djmahe4/cyber-tools-index/main/tools_config.json';
const LOCAL_DEST = path.resolve(root, 'external/cyber-tools-index/tools_config.json');

export async function fetchCyberToolsIndex(): Promise<boolean> {
  try {
    console.log([CyberTools] Fetching tools_config.json from ...);
    const resp = await fetch(CYBER_TOOLS_URL, {
      headers: { 'User-Agent': 'free-llm-mcp-cyber-fetch' }
    });
    if (resp.ok) {
      const text = await resp.text();
      mkdirSync(path.dirname(LOCAL_DEST), { recursive: true });
      writeFileSync(LOCAL_DEST, text, 'utf-8');
      console.log([CyberTools] Successfully synchronized to );
      return true;
    } else {
      console.warn([CyberTools] Remote fetch status HTTP  - skipping.);
      return false;
    }
  } catch (err: any) {
    console.warn([CyberTools] Remote fetch skipped/failed: );
    return false;
  }
}

if (import.meta.url === ile:// || process.argv[1]?.endsWith('fetch-cyber-tools.ts') || process.argv[1]?.endsWith('fetch-cyber-tools.js')) {
  fetchCyberToolsIndex();
}
