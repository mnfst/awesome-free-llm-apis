import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { encrypt, decrypt } from './encryption.js';

/**
 * Tracks usage data that needs to be persisted across sessions and processes.
 */
export interface PersistentUsage {
  lastResetDate: string; // YYYY-MM-DD
  dailyTotalRequests: number;
  dailyTotalTokens: number;
  lifetimeTotalRequests: number;
  lifetimeTotalTokens: number;
  userId?: string;
  username?: string;
  sessionToken?: string;
  sessionExpiresAt?: number;
  lastSyncTime?: number;
  optOutTelemetry?: boolean;
  firebaseUid?: string;
  firebaseRefreshToken?: string;
  fallbackUid?: string;
  lastAuthFailedTime?: number;
  lastSyncFailedTime?: number;
  providers: Record<string, {
    lastSyncTime: number;
    localTotalRequests: number;
    localTotalTokens: number;
    remainingRequests?: number | null;
    remainingTokens?: number | null;
    // Health Tracking Persistence
    failures?: number;
    lastFailure?: number;
    cooldownUntil?: number;
    totalErrors?: number;
  }>;
}

export class PersistenceManager {
  private filePath: string;
  private backupPath: string;
  private lockPath: string;
  private lastSavedState: PersistentUsage | null = null;

  constructor(customPath?: string) {
    this.filePath = customPath || this.resolvePath();
    this.backupPath = `${this.filePath}.bak`;
    this.lockPath = `${this.filePath}.lock`;
  }

  /**
   * Serializes save()'s read-merge-write cycle. Without this, two concurrent saves (e.g.
   * firebase.ts's initFirebase() persisting a fresh firebaseUid, racing against
   * LLMExecutor's debounced/shutdown persistStats() — which saves a state object that
   * omits firebaseUid entirely, relying on merge()'s disk-fallback) can interleave: the
   * second save reads disk BEFORE the first's write lands, so its merge falls back to a
   * stale (or absent) firebaseUid/firebaseRefreshToken and then overwrites the first
   * save's fresh identity. Observed live: the Firebase UID silently changed on every
   * server restart because this race kept discarding the just-persisted identity.
   * Mirrors DiffScanner's acquireLock()/releaseLock() pattern (diff-scanner.ts), but waits
   * for the lock instead of skipping — a save must never be silently dropped.
   */
  private async acquireLock(timeoutMs = 5000): Promise<() => Promise<void>> {
    const start = Date.now();
    while (true) {
      try {
        // fs-extra promisifies the callback-style fs.open, which yields a raw fd
        // number (not a fs/promises FileHandle) — close via fs.close(fd).
        const fd = await fs.open(this.lockPath, 'wx');
        await fs.close(fd);
        return async () => { await fs.remove(this.lockPath).catch(() => {}); };
      } catch (err: any) {
        if (err?.code !== 'EEXIST') {
          // Unexpected error acquiring the lock (e.g. permissions) — proceed without
          // it rather than hang or drop the save.
          return async () => {};
        }
        // Stale-lock override: a process that crashed mid-save shouldn't wedge every
        // future save forever.
        try {
          const stat = await fs.stat(this.lockPath);
          if (Date.now() - stat.mtimeMs > 10000) {
            await fs.remove(this.lockPath).catch(() => {});
            continue;
          }
        } catch { /* lock file vanished between checks — just retry the acquire */ }

        if (Date.now() - start > timeoutMs) {
          // Waited long enough — proceed without the lock rather than hang indefinitely.
          // Losing exclusivity here is strictly better than losing the save entirely.
          return async () => {};
        }
        await new Promise(r => setTimeout(r, 25));
      }
    }
  }

  /**
   * Resolves the persistence path. Always the canonical global location unless
   * explicitly overridden via MCP_USAGE_PATH — this file holds the Firebase
   * identity (firebaseUid/firebaseRefreshToken), so it must resolve to the same
   * path regardless of the process's current working directory. Previously this
   * probed `cwd()` for a local `.mcp-usage.json` and silently preferred it when
   * present, which meant launching the server from a different directory (e.g.
   * different MCP client configs) would read/write a different state file —
   * appearing as the server "creating a new user" and losing quota history.
   */
  private resolvePath(): string {
    if (process.env.MCP_USAGE_PATH) {
      return process.env.MCP_USAGE_PATH;
    }

    const homeDir = os.homedir();
    const globalDir = path.join(homeDir, '.free-llm-mcp');
    const globalPath = path.join(globalDir, 'usage-stats.json');

    return globalPath;
  }

  /**
   * Initializes the directory if it doesn't exist
   */
  async ensureStorage(): Promise<boolean> {
    try {
      await fs.ensureDir(path.dirname(this.filePath));
      return true;
    } catch (e) {
      console.error('Failed to ensure storage directory:', e);
      return false;
    }
  }

  /**
   * Reads and merges stats from disk with memory
   */
  async load(): Promise<PersistentUsage> {
    const emptyState: PersistentUsage = {
      lastResetDate: new Date().toISOString().split('T')[0],
      dailyTotalRequests: 0,
      dailyTotalTokens: 0,
      lifetimeTotalRequests: 0,
      lifetimeTotalTokens: 0,
      providers: {}
    };

    try {
      if (await fs.pathExists(this.filePath)) {
        const rawContent = await fs.readFile(this.filePath, 'utf8');
        const decryptedContent = await decrypt(rawContent);
        const data = JSON.parse(decryptedContent);
        const resetData = this.handleDailyReset(data);
        this.lastSavedState = JSON.parse(JSON.stringify(resetData));
        return resetData;
      }
    } catch (primaryError) {
      // Primary file is corrupted/undecryptable. Before giving up the Firebase
      // identity (firebaseUid/firebaseRefreshToken — losing these re-registers
      // the user as a brand new anonymous account), try the backup written
      // alongside the last successful save().
      try {
        if (await fs.pathExists(this.backupPath)) {
          const rawBackup = await fs.readFile(this.backupPath, 'utf8');
          const decryptedBackup = await decrypt(rawBackup);
          const data = JSON.parse(decryptedBackup);
          const resetData = this.handleDailyReset(data);
          this.lastSavedState = JSON.parse(JSON.stringify(resetData));
          console.error(`[PersistenceManager] Primary usage state at ${this.filePath} was corrupted/undecryptable (${(primaryError as Error)?.message || primaryError}) — recovered Firebase identity and usage stats from backup at ${this.backupPath}.`);
          return resetData;
        }
      } catch (backupError) {
        console.error(`[PersistenceManager] Backup usage state at ${this.backupPath} was also corrupted/undecryptable: ${(backupError as Error)?.message || backupError}`);
      }

      console.error(`[PersistenceManager] Failed to read/decrypt usage state at ${this.filePath} and no usable backup was found — resetting state, INCLUDING FIREBASE IDENTITY (a new anonymous account will be created). Cause: ${(primaryError as Error)?.message || primaryError}`);
    }

    this.lastSavedState = JSON.parse(JSON.stringify(emptyState));
    return emptyState;
  }

  /**
   * Checks for date rollover and resets daily counters if needed
   */
  private handleDailyReset(data: PersistentUsage): PersistentUsage {
    const today = new Date().toISOString().split('T')[0];
    if (data.lastResetDate !== today) {
      return {
        ...data,
        lastResetDate: today,
        dailyTotalRequests: 0,
        dailyTotalTokens: 0
      };
    }
    return data;
  }

  /**
   * Saves usage stats to disk using Read-Merge-Write for atomicity
   */
  async save(memoryState: PersistentUsage): Promise<void> {
    const releaseLock = await this.acquireLock();
    try {
      await this.ensureStorage();
      const today = new Date().toISOString().split('T')[0];

      // Read current disk state for merging
      let diskState: PersistentUsage;
      try {
        if (await fs.pathExists(this.filePath)) {
          const raw = await fs.readFile(this.filePath, 'utf8');
          const decrypted = await decrypt(raw);
          diskState = JSON.parse(decrypted);
        } else {
          throw new Error('File does not exist');
        }
      } catch (e) {
        diskState = {
          lastResetDate: today,
          dailyTotalRequests: 0,
          dailyTotalTokens: 0,
          lifetimeTotalRequests: 0,
          lifetimeTotalTokens: 0,
          providers: {}
        };
      }

      const merged = this.merge(diskState, memoryState);

      // Atomic write: encrypt merged data, write to tmp, then rename
      const tmpPath = `${this.filePath}.tmp`;
      const serialized = JSON.stringify(merged);
      const encrypted = await encrypt(serialized);
      await fs.writeFile(tmpPath, encrypted, 'utf8');
      await fs.rename(tmpPath, this.filePath);

      // Best-effort backup copy so load() can recover the Firebase identity
      // if the primary file is later found corrupted/undecryptable.
      try {
        const backupTmpPath = `${this.backupPath}.tmp`;
        await fs.writeFile(backupTmpPath, encrypted, 'utf8');
        await fs.rename(backupTmpPath, this.backupPath);
      } catch (backupErr) {
        console.error('Failed to write usage stats backup:', backupErr);
      }

      // Update baseline for next delta calculation
      this.lastSavedState = JSON.parse(JSON.stringify(memoryState));
    } catch (e) {
      console.error('Error saving usage stats:', e);
    } finally {
      await releaseLock();
    }
  }

  /**
   * Merges two usage states, favoring the most progress/latest sync
   */
  private merge(disk: PersistentUsage, memory: PersistentUsage): PersistentUsage {
    const today = new Date().toISOString().split('T')[0];
    const base = disk.lastResetDate === today ? disk : this.handleDailyReset(disk);
    
    // Calculate deltas from last saved state
    const prev = this.lastSavedState || {
      lastResetDate: today,
      dailyTotalRequests: 0,
      dailyTotalTokens: 0,
      lifetimeTotalRequests: 0,
      lifetimeTotalTokens: 0,
      providers: {}
    };

    // If day changed locally, previous daily stats are irrelevant for delta
    const prevDailyReq = prev.lastResetDate === today ? prev.dailyTotalRequests : 0;
    const prevDailyTok = prev.lastResetDate === today ? prev.dailyTotalTokens : 0;

    const deltaDailyReq = Math.max(0, memory.dailyTotalRequests - prevDailyReq);
    const deltaDailyTok = Math.max(0, memory.dailyTotalTokens - prevDailyTok);
    const deltaLifetimeReq = Math.max(0, memory.lifetimeTotalRequests - prev.lifetimeTotalRequests);
    const deltaLifetimeTok = Math.max(0, memory.lifetimeTotalTokens - prev.lifetimeTotalTokens);
    
    const result: PersistentUsage = {
      lastResetDate: today,
      dailyTotalRequests: base.dailyTotalRequests + deltaDailyReq,
      dailyTotalTokens: base.dailyTotalTokens + deltaDailyTok,
      lifetimeTotalRequests: base.lifetimeTotalRequests + deltaLifetimeReq,
      lifetimeTotalTokens: base.lifetimeTotalTokens + deltaLifetimeTok,
      userId: memory.userId || base.userId,
      username: memory.username || base.username,
      sessionToken: memory.sessionToken || base.sessionToken,
      sessionExpiresAt: memory.sessionExpiresAt || base.sessionExpiresAt,
      lastSyncTime: Math.max(base.lastSyncTime || 0, memory.lastSyncTime || 0),
      optOutTelemetry: memory.optOutTelemetry !== undefined ? memory.optOutTelemetry : base.optOutTelemetry,
      firebaseUid: memory.firebaseUid || base.firebaseUid,
      firebaseRefreshToken: memory.firebaseRefreshToken || base.firebaseRefreshToken,
      fallbackUid: memory.fallbackUid || base.fallbackUid,
      providers: { ...base.providers }
    };

    // Merge providers
    for (const [id, mProv] of Object.entries(memory.providers)) {
      const dProv = base.providers[id] || { lastSyncTime: 0, localTotalRequests: 0, localTotalTokens: 0 };
      const pProv = prev.providers[id] || { localTotalRequests: 0, localTotalTokens: 0 };
      
      const deltaReq = Math.max(0, mProv.localTotalRequests - pProv.localTotalRequests);
      const deltaTok = Math.max(0, mProv.localTotalTokens - pProv.localTotalTokens);

      result.providers[id] = {
        ...dProv,
        lastSyncTime: Math.max(dProv.lastSyncTime || 0, mProv.lastSyncTime || 0),
        localTotalRequests: (dProv.localTotalRequests || 0) + deltaReq,
        localTotalTokens: (dProv.localTotalTokens || 0) + deltaTok,
        remainingRequests: mProv.remainingRequests !== undefined ? mProv.remainingRequests : dProv.remainingRequests,
        remainingTokens: mProv.remainingTokens !== undefined ? mProv.remainingTokens : dProv.remainingTokens,
        failures: mProv.failures ?? dProv.failures,
        lastFailure: mProv.lastFailure ?? dProv.lastFailure,
        cooldownUntil: mProv.cooldownUntil ?? dProv.cooldownUntil,
        totalErrors: mProv.totalErrors ?? dProv.totalErrors
      };
    }

    return result;
  }
}

export const persistence = new PersistenceManager();
