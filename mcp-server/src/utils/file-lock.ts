import { promises as fs } from 'fs';
import path from 'path';



function isPidAlive(pid: number): boolean {
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
        // signal 0 does no killing — it just probes whether the process exists
        // and we have permission to signal it (works on Windows too via libuv).
        process.kill(pid, 0);
        return true;
    } catch (err: any) {
        return err.code === 'EPERM'; // exists, but owned by someone else — treat as alive
    }
}

/**
 * Removes the lock file if its holder is provably gone (stale by age, or the
 * PID it recorded no longer exists) — recovers from a crashed/force-killed
 * holder that never reached the `finally` cleanup. Never breaks a lock that's
 * merely young or whose holder is still running.
 */
async function reapIfStale(lockPath: string): Promise<void> {
    let stat;
    try {
        stat = await fs.stat(lockPath);
    } catch {
        return; // already gone
    }

    let holderPid = NaN;
    try {
        holderPid = parseInt(await fs.readFile(lockPath, 'utf8'), 10);
    } catch {
        // unreadable — fall through to age check only
    }

    const age = Date.now() - stat.mtimeMs;
    const hasValidPid = Number.isFinite(holderPid) && holderPid > 0;
    
    let shouldReap = false;
    if (hasValidPid) {
        shouldReap = !isPidAlive(holderPid);
    } else {
        // Fallback for corrupted/unreadable locks: break lock if older than 30 seconds
        shouldReap = age > 30000;
    }

    if (shouldReap) {
        try {
            await fs.unlink(lockPath);
        } catch {
            // lost the race with another reaper/the real holder releasing it — fine
        }
    }
}

/**
 * Executes a function holding an exclusive lock on the specified file.
 * Uses atomic file creation (flag 'wx') to ensure concurrency safety.
 */
export async function withFileLock<T>(filePath: string, fn: () => Promise<T>, timeoutMs = 5000): Promise<T> {
    const lockPath = `${filePath}.lock`;
    const start = Date.now();

    while (true) {
        try {
            // Ensure the directory exists
            await fs.mkdir(path.dirname(lockPath), { recursive: true });
            // Attempt to create the lock file atomically
            await fs.writeFile(lockPath, String(process.pid), { flag: 'wx' });
            break; // Lock acquired successfully
        } catch (err: any) {
            if (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EACCES') {
                await reapIfStale(lockPath);
                if (Date.now() - start > timeoutMs) {
                    throw new Error(`Timeout waiting for lock on file: ${filePath}`);
                }
                // Wait and retry
                await new Promise(resolve => setTimeout(resolve, 50));
            } else {
                throw err;
            }
        }
    }

    try {
        return await fn();
    } finally {
        try {
            await fs.unlink(lockPath);
        } catch {
            // Non-blocking cleanup fallback
        }
    }
}
