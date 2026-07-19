import os from 'os';
import { promises as fs } from 'fs';
import { existsSync, readdirSync, realpathSync, statSync } from 'fs';
import path from 'path';

/**
 * Helper utilities that can be spied on in tests.
 */
export const helpers = {
  /**
   * Counts files in a directory recursively up to a limit.
   * Aborts early if the count exceeds the limit.
   */
  countFilesSync(dir: string, limit: number): number {
    let count = 0;
    const queue = [dir];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      let canonical: string;
      try {
        canonical = realpathSync(current);
      } catch {
        canonical = current;
      }

      if (visited.has(canonical)) {
        continue;
      }
      visited.add(canonical);

      try {
        const entries = readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const name = entry.name.toLowerCase();
          // Skip symlinks to avoid cycles or outer files
          if (entry.isSymbolicLink()) {
            continue;
          }
          // Skip common large folders or ignored structures
          if (
            name === 'node_modules' ||
            name === '.git' ||
            name === 'dist' ||
            name === 'build' ||
            name === 'venv' ||
            name === '.venv'
          ) {
            continue;
          }
          if (entry.isDirectory()) {
            queue.push(path.join(current, entry.name));
          } else if (entry.isFile()) {
            count++;
            if (count > limit) {
              return count;
            }
          }
        }
      } catch (err) {
        // Ignore reading errors (permissions, etc.)
      }
    }
    return count;
  }
};

/**
 * Initializes AGENTS.md in the workspace root if it meets safety criteria.
 * Returns true if initialization succeeded (or fell back), false if skipped.
 */
export async function initWorkspace(workspaceRoot: string): Promise<boolean> {
  if (!workspaceRoot) return false;

  let resolvedPath = workspaceRoot;
  try {
    resolvedPath = realpathSync(workspaceRoot);
  } catch {
    // If realpath fails (e.g. path doesn't exist), continue with original
  }

  // Robustness check: Ensure workspace exists and is a directory
  try {
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  // Safety Guards
  // 1. Home directory guard
  if (resolvedPath === os.homedir()) {
    return false;
  }

  // 2. Drive root guard (Windows/Unix)
  if (resolvedPath === '/' || /^[A-Za-z]:[\\\/]?$/.test(resolvedPath)) {
    return false;
  }

  // 3. UNC network path guard
  if (resolvedPath.startsWith('\\\\')) {
    return false;
  }

  // 4. Already exists guard
  const agentsPath = path.join(resolvedPath, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    return false;
  }

  // 5. File count guard (>10,000 files)
  const fileCount = helpers.countFilesSync(resolvedPath, 10000);

  if (fileCount > 10000) {
    return false;
  }

  // Auto-detect project type and language
  let projectType = 'unknown';
  let primaryLanguage = 'unknown';

  if (existsSync(path.join(resolvedPath, 'package.json'))) {
    projectType = 'node';
    primaryLanguage = existsSync(path.join(resolvedPath, 'tsconfig.json')) ? 'typescript' : 'javascript';
  } else if (
    existsSync(path.join(resolvedPath, 'requirements.txt')) ||
    existsSync(path.join(resolvedPath, 'pyproject.toml')) ||
    existsSync(path.join(resolvedPath, 'setup.py'))
  ) {
    projectType = 'python';
    primaryLanguage = 'python';
  } else if (existsSync(path.join(resolvedPath, 'Cargo.toml'))) {
    projectType = 'rust';
    primaryLanguage = 'rust';
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const projectName = path.basename(resolvedPath) || 'project';

  const content = `# Agent Configuration — ${projectName}

> Auto-initialized by free-llm-mcp on ${dateStr}.
> Edit this file to guide agent behavior for this workspace.

## Project Context
- **Type**: ${projectType}
- **Primary Language**: ${primaryLanguage}
- **Description**: (fill this in)

## Memory Preferences
- **Wiki Location**: .free-llm-mcp/wiki/
- **ADR Location**: .free-llm-mcp/wiki/adr/
- **Persona**: auto | coder | researcher | marketer | seo | student

## Token Budget
- **Max context per session**: 32000 tokens
- **Surgical reading**: enabled

## Skip Patterns (files to never index)
- node_modules/, .git/, dist/, build/
`;

  try {
    // Atomic write using .tmp + rename
    const tmpPath = `${agentsPath}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, agentsPath);
    console.error(`[free-llm-mcp] Created AGENTS.md in your workspace. This file guides how the AI assistant understands your project. Edit it to customize behavior.`);
    return true;
  } catch (err) {
    // Fallback to ~/.free-llm-mcp/agents-config.json when workspace is read-only
    try {
      const fallbackDir = path.join(os.homedir(), '.free-llm-mcp');
      await fs.mkdir(fallbackDir, { recursive: true });
      const fallbackPath = path.join(fallbackDir, 'agents-config.json');
      
      const fallbackConfig = {
        workspace: resolvedPath,
        projectType,
        primaryLanguage,
        dateCreated: dateStr
      };

      const tmpFallbackPath = `${fallbackPath}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
      await fs.writeFile(tmpFallbackPath, JSON.stringify(fallbackConfig, null, 2), 'utf-8');
      await fs.rename(tmpFallbackPath, fallbackPath);
      return true;
    } catch {
      return false;
    }
  }
}
