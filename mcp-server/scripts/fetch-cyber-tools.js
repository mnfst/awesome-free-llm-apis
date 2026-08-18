#!/usr/bin/env node
/**
 * @file fetch-cyber-tools.js
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

export async function fetchCyberToolsIndex() {
  try {
    console.error(`[CyberTools] Checking remote tools_config.json from ${CYBER_TOOLS_URL}...`);
    const resp = await fetch(CYBER_TOOLS_URL, {
      headers: { 'User-Agent': 'free-llm-mcp-cyber-fetch' }
    });
    if (resp.ok) {
      const text = await resp.text();
      mkdirSync(path.dirname(LOCAL_DEST), { recursive: true });
      writeFileSync(LOCAL_DEST, text, 'utf-8');
      console.error(`[CyberTools] Successfully synchronized to ${LOCAL_DEST}`);
      return true;
    } else {
      console.error(`[CyberTools] Remote repo has not published tools_config.json yet (HTTP ${resp.status}) - using local bundled fixture.`);
      return false;
    }
  } catch (err) {
    console.error(`[CyberTools] Remote fetch skipped: ${err?.message || err}`);
    return false;
  }
}

if (process.argv[1] && (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('fetch-cyber-tools.js'))) {
  fetchCyberToolsIndex();
}
