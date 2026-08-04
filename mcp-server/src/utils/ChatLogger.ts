import path from 'path';
import os from 'os';
import { writeFileAtomic } from './FileUtils.js';
import fs from 'fs-extra';

const PROJECTS_DIR = path.join(os.homedir(), '.free-llm-mcp', 'projects');

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…[truncated]';
}

const FIVE_MB = 5 * 1024 * 1024;

/**
 * Appends a turn to the workspace/session's chat-logs.json with 5MB rotation support.
 */
export async function logChatTurn(sessionId: string, turn: Record<string, any>): Promise<void> {
  try {
    const projectDir = path.join(PROJECTS_DIR, sessionId);
    const logPath = path.join(projectDir, 'chat-logs.json');
    await fs.ensureDir(projectDir);

    let log: any[] = [];
    try {
      const raw = await fs.readFile(logPath, 'utf-8');
      log = JSON.parse(raw);
    } catch { /* start fresh */ }

    const entryType = turn.role === 'tool_call' ? 'tool' : (turn.isError ? 'error' : 'chat');
    log.push({
      sessionId,
      timestamp: Date.now(),
      type: entryType,
      payload: turn
    });

    if (log.length > 200) log = log.slice(-200);

    const serialized = JSON.stringify(log, null, 2);
    if (serialized.length > FIVE_MB) {
      const rotatedPath = path.join(projectDir, 'chat-logs.1.json');
      try {
        await fs.move(logPath, rotatedPath, { overwrite: true });
      } catch {}
      log = log.slice(-50);
      await writeFileAtomic(logPath, JSON.stringify(log, null, 2));
    } else {
      await writeFileAtomic(logPath, serialized);
    }
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
