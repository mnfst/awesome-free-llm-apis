import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { useFreeLLM } from '../../src/tools/use-free-llm.js';
import { WorkspaceScanner } from '../../src/cache/workspace.js';

const REPO_ROOT = path.resolve(process.cwd());

async function main() {
  const hash = await new WorkspaceScanner(REPO_ROOT).getWorkspaceHash(REPO_ROOT);
  const sessionId = `ws-${hash.substring(0, 16)}`;
  const projectDir = path.join(os.homedir(), '.free-llm-mcp', 'projects', sessionId);
  const chatLogPath = path.join(projectDir, 'chat-log.json');

  console.log('=== sessionId ===', sessionId);
  console.log('=== chatLogPath ===', chatLogPath);

  const before = await fs.pathExists(chatLogPath) ? JSON.parse(await fs.readFile(chatLogPath, 'utf-8')) : [];
  console.log('=== turns before ===', before.length);

  const result = await useFreeLLM({
    messages: [{ role: 'user', content: 'What does the classifyIntent function do in this codebase?' }],
    agentic: true,
    workspace_root: REPO_ROOT,
    sessionId,
  } as any);

  console.log('=== response preview ===', JSON.stringify(result.choices?.[0]?.message?.content).slice(0, 300));

  const after = await fs.pathExists(chatLogPath) ? JSON.parse(await fs.readFile(chatLogPath, 'utf-8')) : null;
  if (!after) {
    console.log('=== FAIL: chat-log.json still does not exist ===');
    process.exit(1);
  }
  console.log('=== turns after ===', after.length);
  console.log('=== new turns ===', JSON.stringify(after.slice(before.length), null, 2));

  const roles = after.slice(before.length).map((t: any) => t.role);
  const ok = roles.includes('user') && roles.includes('assistant');
  console.log(ok ? '=== PASS: user + assistant turns logged ===' : '=== FAIL: missing expected roles ===', roles);

  // Simulate what the dashboard's /api/memory endpoint would return
  const statePath = path.join(projectDir, 'state.json');
  const stateExists = await fs.pathExists(statePath);
  console.log('=== state.json exists ===', stateExists);
  if (stateExists) {
    const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    console.log('=== state keys ===', Object.keys(state));
  }
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
