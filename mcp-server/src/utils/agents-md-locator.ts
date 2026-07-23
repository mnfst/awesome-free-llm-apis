import os from 'os';
import path from 'path';
import { existsSync } from 'fs';

const MAX_WALKUP_DEPTH = 2;

/**
 * Walks up from `startDir` looking for `<dir>/.agents/AGENTS.md`, so a
 * monorepo's canonical AGENTS.md (e.g. at the repo root) is found even when
 * `startDir` is a subproject workspace root nested underneath it. Bounded so
 * it never crosses the user's home directory or filesystem root.
 * Returns the first match, or null if none exists within the bound.
 */
export function findAgentsMdPath(startDir: string, maxDepth = MAX_WALKUP_DEPTH): string | null {
  const home = os.homedir();
  let dir = startDir;
  for (let i = 0; i <= maxDepth; i++) {
    const candidate = path.join(dir, '.agents', 'AGENTS.md');
    if (existsSync(candidate)) return candidate;
    if (dir === home) break;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}
