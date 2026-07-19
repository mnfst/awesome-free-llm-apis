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
  private lastSavedState: PersistentUsage | null = null;

  constructor(customPath?: string) {
    this.filePath = customPath || this.resolvePath();
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
    } catch (e) {
      console.warn(`[PersistenceManager] Failed to read/decrypt usage state at ${this.filePath} — resetting state (including Firebase identity). Cause: ${(e as Error)?.message || e}`);
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

      // Update baseline for next delta calculation
      this.lastSavedState = JSON.parse(JSON.stringify(memoryState));
    } catch (e) {
      console.error('Error saving usage stats:', e);
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
