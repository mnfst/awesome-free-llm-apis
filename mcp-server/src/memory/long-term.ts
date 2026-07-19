import { promises as fs } from 'fs';
import path from 'path';
import { debounce } from '../utils/debounce.js';
import { withFileLock } from '../utils/file-lock.js';
import { writeFileAtomic } from '../utils/FileUtils.js';

// withFileLock() already reaps a lock whose holder is provably dead (crashed/killed) or
// older than its own staleness threshold (30s, see file-lock.ts), so a short busy-wait
// timeout here is redundant for genuine deadlock recovery — it only serves to prematurely
// fail *legitimate* contention (many callers queued for a fast, healthy lock holder).
// Set well above the staleness threshold so real deadlocks are already reaped long before
// this would ever fire, and ordinary contention just waits its turn instead of failing.
const LOCK_WAIT_MS = 30000;

export class LongTermMemory {
  private storePath: string;
  private data: Record<string, unknown> = {};
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  // Concurrent save()/delete() calls used to each take their own exclusive
  // withFileLock() round trip on the *entire* store file — e.g. WorkspaceIndexer
  // indexing N files does up to 4 lock acquisitions per file. Under real
  // concurrent load (multiple workspaces/callers touching the same process's
  // memory store, or across processes) those pile up and can exceed the lock's
  // timeout, dropping writes. Instead, concurrent calls now coalesce onto a
  // single pending write batch (queued via setImmediate so same-tick callers
  // join it) that does ONE lock acquisition for the whole batch — durability
  // per call is unchanged (save()/delete() still await the actual disk write),
  // but lock contention drops by however many calls land in the same batch.
  //
  // IMPORTANT: the batch only ever applies the *specific* keys explicitly
  // written/deleted in it (pendingWrites/pendingDeletes) on top of a fresh
  // on-disk read — never a snapshot of the whole in-memory `this.data`. This
  // process's `this.data` mirrors the *entire* shared store (every workspace),
  // including keys it merely read via ensureLoaded() and never intended to
  // touch. An earlier version merged the full `this.data` snapshot onto fresh
  // disk state, which silently resurrected/clobbered whatever any *other*
  // process had legitimately changed to those untouched keys since — e.g.
  // clear() would correctly delete a key, but the very next unrelated
  // save()/delete() batch on this instance would merge in this process's
  // stale in-memory copy of it and put it right back.
  private pendingWrite: Promise<void> | null = null;
  private pendingWrites = new Map<string, unknown>();
  private pendingDeletes = new Set<string>();

  private debouncedPersist: (() => void) & { flush: () => void };

  constructor(storePath = './data/memory.json') {
    this.storePath = storePath;
    this.debouncedPersist = debounce(() => {
      this.persist().catch(err => console.error('Failed to persist memory:', err));
    }, 1000);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const raw = await fs.readFile(this.storePath, 'utf-8');
        // Merge onto (don't clobber) anything already written in-memory while this load was in flight.
        this.data = { ...(JSON.parse(raw) as Record<string, unknown>), ...this.data };
      } catch {
        // no file yet — keep whatever's already in memory
      }
      this.loaded = true;
    })();
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private persistPromise: Promise<void> | null = null;

  private async persist(): Promise<void> {
    if (this.persistPromise) return this.persistPromise;

    this.persistPromise = (async () => {
      try {
        await writeFileAtomic(this.storePath, JSON.stringify(this.data, null, 2));
      } finally {
        this.persistPromise = null;
      }
    })();

    return this.persistPromise;
  }

  /** Batches this process's in-flight mutations into one locked read-merge-write cycle. */
  private scheduleWrite(): Promise<void> {
    if (this.pendingWrite) return this.pendingWrite;

    this.pendingWrite = (async () => {
      try {
        // Let any synchronously-issued save()/delete() calls from this tick join the batch.
        await new Promise<void>(resolve => setImmediate(resolve));
        const writes = new Map(this.pendingWrites);
        const deletes = new Set(this.pendingDeletes);
        this.pendingWrites.clear();
        this.pendingDeletes.clear();

        await withFileLock(this.storePath, async () => {
          let onDisk: Record<string, unknown> = {};
          try {
            onDisk = JSON.parse(await fs.readFile(this.storePath, 'utf-8'));
          } catch {
            // no file yet, or unreadable — treat as empty base
          }
          // Apply ONLY this batch's explicit mutations on top of the current on-disk
          // truth — never the whole in-memory `this.data`, which can hold stale copies
          // of keys this process never meant to touch (see class-level comment).
          const merged = { ...onDisk };
          for (const [key, value] of writes) merged[key] = value;
          for (const key of deletes) delete merged[key];
          await writeFileAtomic(this.storePath, JSON.stringify(merged, null, 2));
          this.data = merged; // keep in-memory view consistent with what's now durably on disk
        }, LOCK_WAIT_MS);
      } finally {
        this.pendingWrite = null;
      }
    })();

    return this.pendingWrite;
  }

  async save(key: string, value: unknown): Promise<void> {
    await this.ensureLoaded();
    this.data[key] = value;
    this.pendingWrites.set(key, value);
    this.pendingDeletes.delete(key);
    await this.scheduleWrite();
  }

  async load(key: string): Promise<unknown | undefined> {
    await this.ensureLoaded();
    return this.data[key];
  }

  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    delete this.data[key];
    this.pendingWrites.delete(key);
    this.pendingDeletes.add(key);
    await this.scheduleWrite();
  }

  async flush(): Promise<void> {
    await this.debouncedPersist.flush();
  }

  async list(): Promise<string[]> {
    await this.ensureLoaded();
    return Object.keys(this.data);
  }

  async getStats(): Promise<{ totalKeys: number; totalSizeBytes: number }> {
    await this.ensureLoaded();
    const json = JSON.stringify(this.data);
    return {
      totalKeys: Object.keys(this.data).length,
      totalSizeBytes: Buffer.byteLength(json, 'utf-8'),
    };
  }
}
