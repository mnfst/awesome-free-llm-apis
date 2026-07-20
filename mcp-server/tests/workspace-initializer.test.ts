import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initWorkspace, helpers } from '../src/tools/init-workspace.js';
import fs from 'fs/promises';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

describe('WorkspaceInitializer (Phase A)', () => {
    // Use a temp dir OUTSIDE the repo tree (not under process.cwd()) so the
    // .agents/AGENTS.md parent-walk-up (findAgentsMdPath) can never escape
    // into this repo's real .agents/AGENTS.md.
    const testRoot = path.join(os.tmpdir(), `free-llm-mcp-init-ws-test-${Date.now()}`);
    const testDir = path.join(testRoot, 'temp_test_init_ws');
    const backupHomedir = os.homedir();

    beforeEach(async () => {
        await fs.rm(testRoot, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
        vi.restoreAllMocks();
    });

    afterEach(async () => {
        await fs.rm(testRoot, { recursive: true, force: true });
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

    it('creates .agents/AGENTS.md atomically (.tmp + rename)', async () => {
        const renameSpy = vi.spyOn(fs, 'rename');
        const writeFileSpy = vi.spyOn(fs, 'writeFile');

        const result = await initWorkspace(testDir);
        expect(result).toBe(true);
        const agentsPath = path.join(testDir, '.agents', 'AGENTS.md');
        expect(existsSync(agentsPath)).toBe(true);
        expect(existsSync(path.join(testDir, 'AGENTS.md'))).toBe(false);

        // Assert atomic write happened via .tmp + rename
        expect(writeFileSpy).toHaveBeenCalled();
        const firstArg = writeFileSpy.mock.calls[0][0] as string;
        expect(firstArg).toContain('.tmp');
        expect(renameSpy).toHaveBeenCalledWith(firstArg, agentsPath);
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
            expect.stringContaining('[free-llm-mcp] Created .agents/AGENTS.md')
        );
    });

    it('does not re-run init if .agents/AGENTS.md already carries the auto-init marker', async () => {
        const agentsPath = path.join(testDir, '.agents', 'AGENTS.md');
        await fs.mkdir(path.join(testDir, '.agents'), { recursive: true });
        await fs.writeFile(agentsPath, '> Auto-initialized by free-llm-mcp on 2020-01-01.\n# Existing', 'utf-8');

        const writeFileSpy = vi.spyOn(fs, 'writeFile');
        const result = await initWorkspace(testDir);
        expect(result).toBe(false);
        expect(writeFileSpy).not.toHaveBeenCalled();
    });

    it('prepends the template ahead of pre-existing human-authored .agents/AGENTS.md, never overwriting it', async () => {
        const agentsPath = path.join(testDir, '.agents', 'AGENTS.md');
        await fs.mkdir(path.join(testDir, '.agents'), { recursive: true });
        const humanContent = '# Agent Execution Rules — my-project\n\nHand-written rules that must survive.';
        await fs.writeFile(agentsPath, humanContent, 'utf-8');

        const result = await initWorkspace(testDir);
        expect(result).toBe(true);

        const finalContent = readFileSync(agentsPath, 'utf-8');
        expect(finalContent).toContain(humanContent);
        expect(finalContent).toContain('Auto-initialized by free-llm-mcp');
        // Human content must be preserved intact, after the prepended template.
        expect(finalContent.indexOf('Auto-initialized by free-llm-mcp')).toBeLessThan(finalContent.indexOf(humanContent));
    });

    it('reuses a monorepo-parent .agents/AGENTS.md instead of creating a duplicate in a nested subproject workspace', async () => {
        // testRoot/.agents/AGENTS.md (root-level, human-authored) — mirrors this
        // repo's own layout where .agents/AGENTS.md sits above mcp-server/.
        const parentAgentsPath = path.join(testRoot, '.agents', 'AGENTS.md');
        await fs.mkdir(path.join(testRoot, '.agents'), { recursive: true });
        const humanContent = '# Monorepo Agent Guide\n\nShared rules for all subprojects.';
        await fs.writeFile(parentAgentsPath, humanContent, 'utf-8');

        // testDir (= testRoot/temp_test_init_ws) is the nested subproject workspaceRoot.
        const result = await initWorkspace(testDir);
        expect(result).toBe(true);

        // No duplicate created inside the subproject.
        expect(existsSync(path.join(testDir, '.agents', 'AGENTS.md'))).toBe(false);

        // The parent file was found and had the template prepended, human content intact.
        const finalContent = readFileSync(parentAgentsPath, 'utf-8');
        expect(finalContent).toContain(humanContent);
        expect(finalContent).toContain('Auto-initialized by free-llm-mcp');
    });
});
