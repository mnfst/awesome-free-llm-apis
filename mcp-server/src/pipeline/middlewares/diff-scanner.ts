import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { WorkspaceScanner } from '../../cache/workspace.js';

export interface DiffScanResult {
  changedFiles: string[];
  currentBranch: string;
  lastCommitHash: string;
  scanTimestamp: number;
  hasGit: boolean;
}

function spawnAsync(command: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, cwd });
    let stdout = '';
    let stderr = '';
    
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command '${command}' timed out after 10000ms`));
    }, 10000);

    child.stdout?.on('data', data => stdout += data.toString());
    child.stderr?.on('data', data => stderr += data.toString());
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    child.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export class DiffScanner {
  private static async acquireLock(lockPath: string, timeoutMs: number = 300000): Promise<boolean> {
    try {
      await fs.ensureDir(path.dirname(lockPath));
      
      if (await fs.pathExists(lockPath)) {
        const content = await fs.readFile(lockPath, 'utf8');
        const [pidStr, timestampStr] = content.split(':');
        const timestamp = parseInt(timestampStr, 10);
        
        // If lock is less than 5 minutes old, skip/return false (lock is active)
        if (Date.now() - timestamp < 300000) {
          return false;
        }
      }
      
      // Write fresh lock
      await fs.writeFile(lockPath, `${process.pid}:${Date.now()}`, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  private static async releaseLock(lockPath: string): Promise<void> {
    try {
      if (await fs.pathExists(lockPath)) {
        await fs.unlink(lockPath);
      }
    } catch {
      // non-fatal
    }
  }

  static async isGitRepo(workspaceRoot: string): Promise<boolean> {
    const gitDir = path.join(workspaceRoot, '.git');
    return fs.pathExists(gitDir);
  }

  static async getCurrentBranch(workspaceRoot: string): Promise<string> {
    try {
      const { stdout } = await spawnAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], workspaceRoot);
      return stdout.trim();
    } catch {
      return 'main';
    }
  }

  static async getChangedFiles(workspaceRoot: string): Promise<string[]> {
    try {
      const { stdout } = await spawnAsync('git', ['diff', 'HEAD', '--name-only'], workspaceRoot);
      return stdout.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    } catch {
      return [];
    }
  }

  static async scan(workspaceRoot: string): Promise<DiffScanResult> {
    // Use the same ws-<hash16> directory-naming scheme as every other
    // subsystem (WorkspaceScanner.getWorkspaceHash), so this project directory
    // is the same one the dashboard resolves for a given workspace — a
    // standalone hash here previously created a second, disconnected directory.
    const hash = await new WorkspaceScanner(workspaceRoot).getWorkspaceHash(workspaceRoot);
    const wsHash = `ws-${hash.substring(0, 16)}`;
    const projectDir = path.join(os.homedir(), '.free-llm-mcp', 'projects', wsHash);
    const lockPath = path.join(projectDir, 'scan.lock');

    const result: DiffScanResult = {
      changedFiles: [],
      currentBranch: 'main',
      lastCommitHash: '',
      scanTimestamp: Date.now(),
      hasGit: false
    };

    try {
      // Verify git presence and that the path is a git repo
      const isRepo = await this.isGitRepo(workspaceRoot);
      if (!isRepo) {
        return result;
      }
      
      // Test if git command works
      try {
        await spawnAsync('git', ['--version']);
      } catch {
        return result; // git is not in PATH
      }

      result.hasGit = true;

      const hasLock = await this.acquireLock(lockPath);
      if (!hasLock) {
        // Lock acquisition failed (active scan is running elsewhere). Fallback.
        return result;
      }

      try {
        result.currentBranch = await this.getCurrentBranch(workspaceRoot);
        result.changedFiles = await this.getChangedFiles(workspaceRoot);
        
        try {
          const { stdout } = await spawnAsync('git', ['rev-parse', 'HEAD'], workspaceRoot);
          result.lastCommitHash = stdout.trim();
        } catch {
          // Empty repo or no commit
        }
      } finally {
        await this.releaseLock(lockPath);
      }

      return result;
    } catch {
      return result;
    }
  }
}
