/**
 * chat-logger.test.ts — Shared ChatLogger module
 *
 * Tests logChatTurn (rolling 200-entry window, atomic write) and
 * logToolCall (structured tool_call turn, arg/result truncation).
 *
 * Strategy: mock writeFileAtomic to capture the JSON that would be written
 * (no real disk I/O). Each test uses a fresh unique sessionId to avoid
 * cross-test state from a real chat-log.json on disk.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// We must hoist the mock so it is available at module evaluation time.
const { writeFileMock } = vi.hoisted(() => ({
  writeFileMock: vi.fn(),
}));

vi.mock('../src/utils/FileUtils.js', () => ({
  writeFileAtomic: writeFileMock,
}));

// Also mock fs-extra so readFile always returns '[]' (empty log) unless
// we inject something via the readFileMock.
const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}));
vi.mock('fs-extra', async () => {
  const real = await vi.importActual<typeof import('fs-extra')>('fs-extra');
  return {
    ...real,
    readFile: readFileMock,
    ensureDir: vi.fn().mockResolvedValue(undefined),
  };
});

import { logChatTurn, logToolCall } from '../src/utils/ChatLogger.js';

// Helper: unique session per test
function uniqueSession(): string {
  return `test-session-${Math.random().toString(36).slice(2, 10)}`;
}

// Helper: parse the last writeFileAtomic call's data
function lastWritten(): any[] {
  const calls = writeFileMock.mock.calls;
  if (calls.length === 0) return [];
  const [, data] = calls[calls.length - 1];
  return JSON.parse(data as string);
}

describe('ChatLogger', () => {
  beforeEach(() => {
    writeFileMock.mockReset().mockResolvedValue(undefined);
    // Default: readFile throws (simulates no existing log on disk → empty array)
    readFileMock.mockReset().mockRejectedValue(new Error('ENOENT'));
  });

  // ── logChatTurn ────────────────────────────────────────────────────────────

  it('writes a turn with a ts field and the supplied role/content', async () => {
    const before = Date.now();
    await logChatTurn(uniqueSession(), { role: 'user', content: 'hello' });
    const after = Date.now();

    expect(writeFileMock).toHaveBeenCalledOnce();
    const log = lastWritten();
    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBe(1);
    expect(log[0].role).toBe('user');
    expect(log[0].content).toBe('hello');
    expect(log[0].ts).toBeGreaterThanOrEqual(before);
    expect(log[0].ts).toBeLessThanOrEqual(after);
  });

  it('enforces rolling 200-entry window: 201 existing entries → trimmed to 200', async () => {
    // Pre-seed readFile to return 200 entries
    const existing = Array.from({ length: 200 }, (_, i) => ({ role: 'user', content: `msg-${i}`, ts: i }));
    readFileMock.mockResolvedValueOnce(JSON.stringify(existing));

    await logChatTurn(uniqueSession(), { role: 'user', content: 'overflow' });

    const log = lastWritten();
    expect(log.length).toBe(200);
    // Last entry must be the new one
    expect(log[199].content).toBe('overflow');
    // First entry of the original 200 was msg-0, which got evicted
    expect(log[0].content).toBe('msg-1');
  });

  it('is non-fatal when writeFileAtomic throws', async () => {
    writeFileMock.mockRejectedValueOnce(new Error('disk full'));
    await expect(logChatTurn(uniqueSession(), { role: 'user', content: 'x' })).resolves.toBeUndefined();
  });

  it('appends to an existing log on disk when readFile succeeds', async () => {
    const existing = [{ role: 'assistant', content: 'prior', ts: 1000 }];
    readFileMock.mockResolvedValueOnce(JSON.stringify(existing));

    await logChatTurn(uniqueSession(), { role: 'user', content: 'new' });

    const log = lastWritten();
    expect(log.length).toBe(2);
    expect(log[0].content).toBe('prior');
    expect(log[1].content).toBe('new');
  });

  // ── logToolCall ────────────────────────────────────────────────────────────

  it('writes a tool_call role entry with the correct shape', async () => {
    await logToolCall(uniqueSession(), 'read_file', { path: '/foo.ts' }, { content: 'hello' }, 42, false);

    expect(writeFileMock).toHaveBeenCalledOnce();
    const log = lastWritten();
    const entry = log[log.length - 1]; // most recent entry
    expect(entry.role).toBe('tool_call');
    expect(entry.tool).toBe('read_file');
    expect(entry.latencyMs).toBe(42);
    expect(entry.isError).toBe(false);
    expect(typeof entry.args).toBe('string');   // serialized+possibly truncated
    expect(typeof entry.result).toBe('string'); // serialized+possibly truncated
    expect(entry.ts).toBeDefined();
  });

  it('truncates large args/result to avoid dumping base64 payloads', async () => {
    const hugeBase64 = 'A'.repeat(10_000);
    await logToolCall(uniqueSession(), 'vision_tool', { image: hugeBase64 }, { data: hugeBase64 }, 100, false);

    const log = lastWritten();
    const entry = log[log.length - 1];
    // Both must be <= 400 chars + '[truncated]' suffix (= at most 414 chars)
    expect(entry.args.length).toBeLessThanOrEqual(414);
    expect(entry.result.length).toBeLessThanOrEqual(414);
    expect(entry.args).toContain('[truncated]');
    expect(entry.result).toContain('[truncated]');
  });

  it('records isError: true for failing tool calls', async () => {
    await logToolCall(uniqueSession(), 'read_file', {}, { error: 'not found' }, 5, true);

    const log = lastWritten();
    expect(log[log.length - 1].isError).toBe(true);
  });

  it('falls back gracefully when sessionId is __no_ws__', async () => {
    await expect(
      logToolCall('__no_ws__', 'get_token_stats', {}, { tokens: 0 }, 10, false)
    ).resolves.toBeUndefined();
    expect(writeFileMock).toHaveBeenCalledOnce();
    expect(() => JSON.parse(writeFileMock.mock.calls[0][1] as string)).not.toThrow();
  });
});
