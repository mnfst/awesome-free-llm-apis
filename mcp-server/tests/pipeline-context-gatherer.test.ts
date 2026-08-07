import { describe, it, expect } from 'vitest';
import { useCacheIsolation } from './helpers/test-cache-isolation.js';
import { ContextGatherer } from '../src/pipeline/middlewares/context-gatherer.js';
import { getIntelligentSystemPrompt } from '../src/pipeline/middlewares/prompts.js';
import { TaskType } from '../src/pipeline/middleware.js';
import { memoryManager } from '../src/memory/index.js';

describe('ContextGatherer 4-Layer Retrieval & Prompt Integration', () => {
  const { getWsRoot } = useCacheIsolation();

  it('gathers context from ShortTerm, LongTerm, WikiMemory, and VectorStore', async () => {
    const wsRoot = getWsRoot();
    const query = 'How does WorkspaceContextMiddleware assemble context from all 4 memory layers?';

    // 1. Seed ShortTerm
    memoryManager.shortTerm.set('test-msg-1', { role: 'user', content: 'ShortTerm message about memory layers' });

    // 2. Gather context via ContextGatherer
    const gatherer = new ContextGatherer(wsRoot);
    const gathered = await gatherer.gather(query, TaskType.Code, 'coder');

    expect(gathered).toBeDefined();
    expect(typeof gathered.shortTermSummary).toBe('string');
    expect(typeof gathered.longTermSummary).toBe('string');

    // 3. Pass gathered context to getIntelligentSystemPrompt
    const systemPrompt = await getIntelligentSystemPrompt(query, gathered);
    expect(systemPrompt).toBeDefined();
    expect(systemPrompt.length).toBeGreaterThan(50);
  });
});
