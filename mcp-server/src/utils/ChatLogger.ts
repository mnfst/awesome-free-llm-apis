import path from 'path';
import os from 'os';
import { writeFileAtomic } from './FileUtils.js';
import fs from 'fs-extra';

const PROJECTS_DIR = path.join(os.homedir(), '.free-llm-mcp', 'projects');

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…[truncated]';
}

/**
 * Appends a turn to the session's chat-log.json with a rolling 200-entry window.
 * Extracted from AgenticMiddleware.ts so other call sites (MCP dispatcher,
 * use-free-llm interception loop) share a single implementation.
 */
export async function logChatTurn(sessionId: string, turn: Record<string, any>): Promise<void> {
  try {
    const logPath = path.join(PROJECTS_DIR, sessionId, 'chat-log.json');
    await fs.ensureDir(path.dirname(logPath));
    let log: any[] = [];
    try {
      const raw = await fs.readFile(logPath, 'utf-8');
      log = JSON.parse(raw);
    } catch { /* start fresh */ }
    log.push({ ts: Date.now(), ...turn });
    if (log.length > 200) log = log.slice(-200);
    await writeFileAtomic(logPath, JSON.stringify(log));
  } catch {
    // non-fatal — logging must never affect the call path
  }
}

/**
 * Logs a single tool invocation (role: 'tool_call') into the session log.
 * args/result are truncated to 400 chars each to avoid dumping base64 payloads.
 */
export async function logToolCall(
  sessionId: string,
  tool: string,
  args: unknown,
  result: unknown,
  latencyMs: number,
  isError = false
): Promise<void> {
  await logChatTurn(sessionId, {
    role: 'tool_call',
    tool,
    args: truncate(JSON.stringify(args ?? null), 400),
    result: truncate(JSON.stringify(result ?? null), 400),
    latencyMs,
    isError,
  });
}
