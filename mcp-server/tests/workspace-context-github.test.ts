import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceContextMiddleware } from '../src/pipeline/middlewares/WorkspaceContextMiddleware.js';
import { GithubRepoScanner } from '../src/utils/GithubRepoScanner.js';
import { memoryManager } from '../src/memory/index.js';
import type { PipelineContext } from '../src/pipeline/middleware.js';

describe('WorkspaceContextMiddleware Github Integration', () => {
    let middleware: WorkspaceContextMiddleware;
    let mockContext: PipelineContext;
    let stubWikiSearch: ReturnType<typeof vi.fn>;
    let stubWikiWrite: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        middleware = new WorkspaceContextMiddleware();
        mockContext = {
            sessionId: 'test-session',
            request: {
                messages: [
                    { role: 'user', content: 'Analyze the dependencies, functions and code structure of https://github.com/nmap/nmap' }
                ],
                model: 'gpt-4o',
                agentic: false
            }
        } as any;
        vi.restoreAllMocks();
        vi.spyOn(GithubRepoScanner, 'scanRepoCode').mockResolvedValue({
            treeSummary: ['src/main.ts', 'src/utils.ts'],
            scannedFiles: [
                {
                    path: 'src/main.ts',
                    dependencies: ['express'],
                    functions: ['startServer'],
                    flow: [],
                    flags: ['--port (-p)']
                }
            ]
        });

        // Stub WikiMemory so tests never touch the real ~/.free-llm-mcp/wiki directory.
        stubWikiSearch = vi.fn().mockResolvedValue([]);
        stubWikiWrite = vi.fn().mockResolvedValue({});
        vi.spyOn(memoryManager, 'getWiki').mockReturnValue({
            search: stubWikiSearch,
            write: stubWikiWrite,
        } as any);
    });

    it('should scan Github URL, fetch README, analyze it, and append repository context', async () => {
        const mockReadme = `
            # Nmap
            This is Nmap.
            import { helper } from './helper';
            function runScan() {
                initiate();
            }
            function initiate() {}
        `;
        
        const fetchRawSpy = vi.spyOn(GithubRepoScanner, 'fetchRawContent').mockResolvedValue(mockReadme);

        await middleware.execute(mockContext, async () => {});

        expect(fetchRawSpy).toHaveBeenCalledWith('nmap', 'nmap', 'README.md', undefined);

        const userMessage = mockContext.request.messages.find(m => m.role === 'user');
        expect(userMessage).toBeDefined();
        expect(userMessage!.content).toContain('## 🌐 GITHUB REPOSITORY CONTEXT');
        expect(userMessage!.content).toContain('Repository: nmap/nmap');
        expect(userMessage!.content).toContain('README Dependencies: ./helper');
        expect(userMessage!.content).toContain('README Functions: runScan, initiate');
        expect(userMessage!.content).toContain('README Flow:\n  - runScan -> initiate');
        expect(userMessage!.content).toContain('Repository Files Tree (Subset):\n  - src/main.ts\n  - src/utils.ts');
        expect(userMessage!.content).toContain('File: src/main.ts');
        expect(userMessage!.content).toContain('- Flags: --port (-p)');
        expect(userMessage!.content).toContain('- Dependencies: express');
        expect(userMessage!.content).toContain('- Functions: startServer');
    });

    it('should NOT trigger repo scanning for GitHub URLs that are injected via middleware', async () => {
        const fetchRawSpy = vi.spyOn(GithubRepoScanner, 'fetchRawContent').mockResolvedValue('');
        
        mockContext.request.messages[0].content = `
Some user request here.
## 📋 TARGET PROJECT GUIDELINES
<target_project_guidelines_isolation_gate>
Refer to this injected guide: https://github.com/nmap/nmap
</target_project_guidelines_isolation_gate>
`;
        await middleware.execute(mockContext, async () => {});
        expect(fetchRawSpy).not.toHaveBeenCalled();
    });

    it('should persist a discovered GitHub security tool to the global cyber wiki when the prompt is cyber-flavored', async () => {
        const mockReadme = `# Nmap\nNetwork exploration tool and security / port scanner.`;
        vi.spyOn(GithubRepoScanner, 'fetchRawContent').mockResolvedValue(mockReadme);

        // "nmap" itself matches CYBER_TERMS_REGEX, so this prompt should trigger the cyber wiki write.
        mockContext.request.messages[0].content = 'Tell me about the pentest tool at https://github.com/nmap/nmap';
        await middleware.execute(mockContext, async () => {});

        expect(memoryManager.getWiki).toHaveBeenCalledWith('global-cyber-tools');
        expect(stubWikiWrite).toHaveBeenCalledWith(
            'nmap/nmap',
            expect.any(String),
            expect.arrayContaining(['cyber', 'github-tool', 'nmap']),
            ['https://github.com/nmap/nmap']
        );
    });

    it('should NOT write to the cyber wiki for a non-cyber GitHub prompt', async () => {
        const mockReadme = `# Express\nFast, unopinionated web framework for Node.js.`;
        vi.spyOn(GithubRepoScanner, 'fetchRawContent').mockResolvedValue(mockReadme);

        mockContext.request.messages[0].content = 'Summarize https://github.com/expressjs/express for me';
        await middleware.execute(mockContext, async () => {});

        expect(stubWikiWrite).not.toHaveBeenCalled();
    });

    it('should scan readme and workspace for command usages if nmap or similar is mentioned', async () => {
        const mockReadme = `
            # Nmap Scanner
            Run nmap -sV -p 80 target.com to scan ports.
        `;
        const fetchRawSpy = vi.spyOn(GithubRepoScanner, 'fetchRawContent').mockResolvedValue(mockReadme);

        mockContext.request.messages[0].content = 'Tell me about https://github.com/nmap/nmap and run nmap scan';
        await middleware.execute(mockContext, async () => {});

        const userMessage = mockContext.request.messages.find(m => m.role === 'user');
        expect(userMessage).toBeDefined();
        expect(userMessage!.content).toContain('Command \'nmap\' in README');
        expect(userMessage!.content).toContain('Run nmap -sV -p 80 target.com to scan ports.');
    });
});
