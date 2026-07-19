import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initWorkspace, helpers } from '../src/tools/init-workspace.js';
import fs from 'fs/promises';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

describe('WorkspaceInitializer (Phase A)', () => {
    const testDir = path.join(process.cwd(), 'temp_test_init_ws');
    const backupHomedir = os.homedir();

    beforeEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
        vi.restoreAllMocks();
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('skips AGENTS.md init for home directory', async () => {
        const spyHomedir = vi.spyOn(os, 'homedir').mockReturnValue(testDir);
        const result = await initWorkspace(testDir);
        expect(result).toBe(false);
        expect(existsSync(path.join(testDir, 'AGENTS.md'))).toBe(false);
    });

    it('skips AGENTS.md init for drive root C:\\', async () => {
        const result = await initWorkspace('C:\\');
        expect(result).toBe(false);
    });

    it('skips AGENTS.md init for Unix root /', async () => {
        const result = await initWorkspace('/');
        expect(result).toBe(false);
    });

    it('skips AGENTS.md init when workspace has > 10000 files', async () => {
        // Mock helpers.countFilesSync to return 10001
        vi.spyOn(helpers, 'countFilesSync').mockReturnValue(10001);

        const result = await initWorkspace(testDir);
        expect(result).toBe(false);
        expect(existsSync(path.join(testDir, 'AGENTS.md'))).toBe(false);
    });

    it('skips AGENTS.md init when workspace is a UNC path', async () => {
        const result = await initWorkspace('\\\\server\\share\\project');
        expect(result).toBe(false);
    });

    it('creates AGENTS.md atomically (.tmp + rename)', async () => {
        const renameSpy = vi.spyOn(fs, 'rename');
        const writeFileSpy = vi.spyOn(fs, 'writeFile');
        
        const result = await initWorkspace(testDir);
        expect(result).toBe(true);
        expect(existsSync(path.join(testDir, 'AGENTS.md'))).toBe(true);
        
        // Assert atomic write happened via .tmp + rename
        expect(writeFileSpy).toHaveBeenCalled();
        const firstArg = writeFileSpy.mock.calls[0][0] as string;
        expect(firstArg).toContain('.tmp');
        expect(renameSpy).toHaveBeenCalledWith(firstArg, path.join(testDir, 'AGENTS.md'));
    });

    it('falls back to ~/.free-llm-mcp/agents-config.json when workspace read-only', async () => {
        // Force workspace write to fail only when target contains AGENTS.md
        const originalWriteFile = fs.writeFile;
        vi.spyOn(fs, 'writeFile').mockImplementation((filePath: any, data: any, options: any) => {
            if (typeof filePath === 'string' && filePath.includes('AGENTS.md')) {
                throw new Error('EACCES: permission denied');
            }
            return originalWriteFile(filePath, data, options);
        });

        const customHome = path.join(testDir, 'custom_home');
        await fs.mkdir(customHome, { recursive: true });
        vi.spyOn(os, 'homedir').mockReturnValue(customHome);

        const result = await initWorkspace(testDir);
        expect(result).toBe(true);
        
        const fallbackPath = path.join(customHome, '.free-llm-mcp', 'agents-config.json');
        expect(existsSync(fallbackPath)).toBe(true);
    });

    it('logs one-time creation message on stderr', async () => {
        const consoleSpy = vi.spyOn(console, 'error');
        const result = await initWorkspace(testDir);
        expect(result).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('[free-llm-mcp] Created AGENTS.md')
        );
    });

    it('does not re-create AGENTS.md if it already exists', async () => {
        const agentsPath = path.join(testDir, 'AGENTS.md');
        await fs.writeFile(agentsPath, '# Existing Configuration', 'utf-8');
        
        const writeFileSpy = vi.spyOn(fs, 'writeFile');
        const result = await initWorkspace(testDir);
        expect(result).toBe(false);
        expect(writeFileSpy).not.toHaveBeenCalled();
    });
});
