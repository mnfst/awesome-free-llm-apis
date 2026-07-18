import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSkill } from '../src/tools/execute-skill.js';
import fs from 'fs-extra';
import { useFreeLLM } from '../src/tools/use-free-llm.js';

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  }
}));

vi.mock('../src/tools/use-free-llm.js', () => ({
  useFreeLLM: vi.fn(),
}));

// Prevent the wiki pre-read/post-write hooks from touching the real ~/.free-llm-mcp/wiki directory.
vi.mock('../src/memory/index.js', () => ({
  memoryManager: {
    getWiki: vi.fn().mockReturnValue({
      search: vi.fn().mockResolvedValue([]),
      write: vi.fn().mockResolvedValue({}),
    })
  }
}));

vi.mock('../src/cache/workspace.js', () => ({
  WorkspaceScanner: class {
    getWorkspaceHash = vi.fn().mockResolvedValue('test-hash');
  }
}));

describe('execute_skill', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('rejects path traversal and invalid skill names', async () => {
    const result1 = await executeSkill({
      skill: '../../secrets',
      input: 'analyze'
    });
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('Security Exception');

    const result2 = await executeSkill({
      skill: 'invalid@name',
      input: 'analyze'
    });
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Security Exception');
  });

  it('loads skill core instructions and calls useFreeLLM', async () => {
    // Mock existence of SKILL.md
    vi.spyOn(fs, 'pathExists').mockImplementation(async (p: any) => {
      if (typeof p === 'string' && p.endsWith('SKILL.md')) return true;
      if (typeof p === 'string' && p.includes('skills')) return true;
      return false;
    });

    (vi.spyOn(fs, 'readFile') as any).mockResolvedValue('## Core Instructions\nApply these guidelines.');

    (useFreeLLM as any).mockResolvedValue({
      choices: [{ message: { content: 'Optimized response' } }]
    });

    const result = await executeSkill({
      skill: 'test-skill',
      input: 'run instruction',
      workspace_root: '/custom/workspace'
    });

    expect(result.success).toBe(true);
    expect(result.response).toBe('Optimized response');
    expect(useFreeLLM).toHaveBeenCalledWith(expect.objectContaining({
      agentic: false,
      messages: [
        { role: 'system', content: expect.stringContaining('## Core Instructions\nApply these guidelines.') },
        { role: 'user', content: 'run instruction' }
      ]
    }));
  });

  it('handles referenced files, loading available ones and reporting missing ones', async () => {
    // Mock existence of files:
    // SKILL.md references references/doc1.md and resources/playbook.md
    const skillContent = 'Instructions here. Open `references/doc1.md` and `resources/playbook.md`';
    
    vi.spyOn(fs, 'pathExists').mockImplementation(async (p: any) => {
      if (typeof p === 'string' && p.endsWith('SKILL.md')) return true;
      if (typeof p === 'string' && p.endsWith('doc1.md')) return true; // doc1 exists
      if (typeof p === 'string' && p.endsWith('playbook.md')) return false; // playbook missing
      if (typeof p === 'string' && p.includes('skills')) return true;
      return false;
    });

    vi.spyOn(fs, 'stat').mockImplementation(async (p: any) => {
      return { isFile: () => true } as any;
    });

    vi.spyOn(fs, 'readFile').mockImplementation(async (p: any) => {
      if (typeof p === 'string' && p.endsWith('SKILL.md')) return skillContent;
      if (typeof p === 'string' && p.endsWith('doc1.md')) return 'Document 1 content';
      return '';
    });

    (useFreeLLM as any).mockResolvedValue({
      choices: [{ message: { content: 'Response content' } }]
    });

    const result = await executeSkill({
      skill: 'db-optimizer',
      input: 'do optimize',
      workspace_root: '/custom/workspace'
    });

    expect(result.success).toBe(true);
    
    // verify useFreeLLM system prompt contains:
    // 1. Missing references note warning
    // 2. SKILL.md core content
    // 3. Document 1 content
    const callArgs = (useFreeLLM as any).mock.calls[0][0];
    const systemPrompt = callArgs.messages[0].content;
    
    expect(systemPrompt).toContain('NOT available in this environment: `resources/playbook.md`');
    expect(systemPrompt).toContain('Instructions here');
    expect(systemPrompt).toContain('## Skill Reference File: references/doc1.md');
    expect(systemPrompt).toContain('Document 1 content');
    expect(systemPrompt).not.toContain('## Skill Reference File: resources/playbook.md');
  });
});
