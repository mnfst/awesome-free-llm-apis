import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { StructuralMarkdownMiddleware } from '../src/pipeline/middlewares/StructuralMiddleware.js';
import type { PipelineContext } from '../src/pipeline/middleware.js';

vi.mock('fs-extra', () => ({
    default: {
        pathExists: vi.fn(),
        readFile: vi.fn(),
    },
    pathExists: vi.fn(),
    readFile: vi.fn(),
}));

describe('StructuralMarkdownMiddleware Unit Tests', () => {
    let middleware: StructuralMarkdownMiddleware;
    let mockContext: PipelineContext;

    beforeEach(() => {
        middleware = new StructuralMarkdownMiddleware();
        mockContext = {
            request: {
                messages: [{ role: 'user', content: 'hello' }],
                sessionId: 'test-session',
                agentic: true, // v1.0.4 mandatory flag
            },
            storage: {
                get: vi.fn(),
                set: vi.fn(),
            },
        } as any;
        vi.clearAllMocks();
    });

    it('should correctly aggregate all structural state files', async () => {
        const mockFiles: Record<string, string> = {
            'state.json': JSON.stringify({
                nowQueue: ['task1'],
                nextQueue: ['task2']
            }),
            'knowledge.md': '# Session Knowledge\n- This is a substantive piece of knowledge that should be extracted by the distillation logic because it is long enough.',
        };

        (fs.pathExists as any).mockImplementation(async (p: string) => {
            const basename = path.basename(p);
            return !!mockFiles[basename];
        });

        (fs.readFile as any).mockImplementation(async (p: string) => {
            const basename = path.basename(p);
            return mockFiles[basename];
        });

        await middleware.execute(mockContext, async () => {});

        const lastMessage = mockContext.request.messages[mockContext.request.messages.length - 1];
        expect(lastMessage.content).toContain('## MCP INTERNAL SESSION STATE');
        expect(lastMessage.content).toContain('### QUEUE DIAGNOSTICS');
        expect(lastMessage.content).toContain('**Current:**   task1');
        expect(lastMessage.content).toContain('### SESSION DISTILLATION');
    });

    it('renders {id, task} queue entries (current state.json schema) the same as legacy plain-string entries', async () => {
        const mockFiles: Record<string, string> = {
            'state.json': JSON.stringify({
                nowQueue: [{ id: 't1', task: 'task1' }],
                nextQueue: [{ id: 't2', task: 'task2' }]
            }),
            'knowledge.md': '# Session Knowledge\n- This is a substantive piece of knowledge that should be extracted by the distillation logic because it is long enough.',
        };

        (fs.pathExists as any).mockImplementation(async (p: string) => {
            const basename = path.basename(p);
            return !!mockFiles[basename];
        });

        (fs.readFile as any).mockImplementation(async (p: string) => {
            const basename = path.basename(p);
            return mockFiles[basename];
        });

        await middleware.execute(mockContext, async () => {});

        const lastMessage = mockContext.request.messages[mockContext.request.messages.length - 1];
        expect(lastMessage.content).toContain('**Current:**   task1');
        expect(lastMessage.content).toContain('**Upcoming:**  task2');
        expect(lastMessage.content).not.toContain('[object Object]');
    });

    it('should ignore empty scaffolds and fallback', async () => {
        const mockFiles: Record<string, string> = {
            'knowledge.md': '# MISSION PLAN', // Too short to pass the > 50 char threshold (sections.length will be 0)
        };

        (fs.pathExists as any).mockImplementation(async (p: string) => {
            const basename = path.basename(p);
            return !!mockFiles[basename];
        });

        (fs.readFile as any).mockImplementation(async (p: string) => {
            const basename = path.basename(p);
            return mockFiles[basename];
        });

        await middleware.execute(mockContext, async () => {});

        const lastMessage = mockContext.request.messages[mockContext.request.messages.length - 1];
        expect(lastMessage.content).toContain('No prior state – starting fresh session.');
    });

    it('should enforce security boundaries and reject path traversal', async () => {
        // The regex v1.0.4 should reject this BEFORE file access
        (mockContext.request as any).sessionId = '../../etc/passwd';
        
        await middleware.execute(mockContext, async () => {});
        
        expect(fs.pathExists).not.toHaveBeenCalled();
    });

    it('should reject invalid sessionId characters', async () => {
        (mockContext.request as any).sessionId = 'session!@#';
        
        await middleware.execute(mockContext, async () => {});
        
        expect(fs.pathExists).not.toHaveBeenCalled();
    });
});
