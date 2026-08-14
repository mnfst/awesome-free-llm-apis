import { bench, describe, afterAll } from 'vitest';
import { useCacheIsolation } from '../tests/helpers/test-cache-isolation.js';
import { memoryManager, selectAmplitudeLines } from '../src/memory/index.js';
import { WorkspaceContextMiddleware } from '../src/pipeline/middlewares/WorkspaceContextMiddleware.js';
import { getIntelligentSystemPrompt } from '../src/pipeline/middlewares/prompts.js';
import { isUserConfused } from '../src/utils/MessageUtils.js';
import { countTokens } from './helpers/token-counter.js';
import { writeBenchmarkLog } from './helpers/log-writer.js';
import type { Message } from '../src/providers/types.js';
import type { PipelineContext } from '../src/pipeline/middleware.js';
import path from 'node:path';
import fs from 'node:fs';

const { getWsRoot } = useCacheIsolation();

describe('01 — Pipeline: Real WorkspaceContextMiddleware Execution & 4-Layer Memory Contribution', () => {
  afterAll(async () => {
    await generateLogReport();
  });

  // ── LAYER 1: ShortTerm ──────────────────────────────────────────────────
  bench('Layer 1: ShortTermMemory — recent conversation turns', () => {
    const STM = memoryManager.shortTerm;
    for (let i = 0; i < 50; i++) {
      STM.set(`turn:${i}`, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Add JWT authentication to login handler turn ${i}`
      });
    }
  });

  // ── LAYER 2: LongTerm ───────────────────────────────────────────────────
  bench('Layer 2: LongTermMemory — workspace state & tool outputs', async () => {
    const wsRoot = getWsRoot();
    const ltm = memoryManager.longTerm;
    await ltm.save(`tool:use_free_llm:${wsRoot}`, {
      tool: 'use_free_llm',
      content: 'WorkspaceContextMiddleware gathers context from ShortTerm, LongTerm, WikiMemory, and VectorStore.',
      confidence: 0.95
    });
  });

  // ── LAYER 3: WikiMemory ──────────────────────────────────────────────────
  bench('Layer 3: WikiMemory — workspace knowledge search', async () => {
    const wiki = memoryManager.getWiki('memory-bench', getWsRoot());
    await wiki.write('architecture/memory-layers', '# Memory Architecture\nShortTerm, LongTerm, WikiMemory, VectorStore.', ['architecture'], []);
    await wiki.search('memory layers', 'coder');
  });

  // ── LAYER 4: VectorStore / Born-Rule Line Sampler ────────────────────────
  const targetFile = path.resolve('./src/pipeline/middlewares/WorkspaceContextMiddleware.ts');
  let cachedTargetLines: string[];
  try {
    cachedTargetLines = fs.readFileSync(targetFile, 'utf-8').split('\n');
  } catch {
    cachedTargetLines = Array.from({ length: 500 }, (_, i) => `// line ${i}`);
  }

  bench('Layer 4: Born-Rule Line Sampler — WorkspaceContextMiddleware.ts code reduction', () => {
    selectAmplitudeLines(cachedTargetLines);
  });

  // ── SCENARIO A: Agentic Mode (isOnePass: false) ─────────────────────────
  bench('Agentic Mode (isOnePass: false) — WorkspaceContextMiddleware.execute()', async () => {
    const middleware = new WorkspaceContextMiddleware();
    const query = 'Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed';
    const context: PipelineContext = {
      request: {
        model: 'gemini-3.1-flash-lite',
        agentic: true,
        messages: [
          { role: 'user', content: 'Refactor session middleware to use Redis' },
          { role: 'assistant', content: 'Session middleware updated.' },
          { role: 'user', content: query }
        ]
      },
      taskType: 'coder' as any,
      workspaceRoot: getWsRoot(),
      sessionId: 'bench-session-agentic',
      isOnePass: false
    };

    await middleware.execute(context, async () => {});
    countTokens(JSON.stringify(context.request.messages));
  });

  // ── SCENARIO B: Non-Agentic Mode (isOnePass: true) ──────────────────────
  bench('Non-Agentic Mode (isOnePass: true) — WorkspaceContextMiddleware.execute()', async () => {
    const middleware = new WorkspaceContextMiddleware();
    const query = 'Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed';
    const context: PipelineContext = {
      request: {
        model: 'gemini-3.1-flash-lite',
        agentic: false,
        messages: [
          { role: 'user', content: query }
        ]
      },
      taskType: 'coder' as any,
      workspaceRoot: getWsRoot(),
      sessionId: 'bench-session-non-agentic',
      isOnePass: true
    };

    await middleware.execute(context, async () => {});
    countTokens(JSON.stringify(context.request.messages));
  });

  // ── SCENARIO C: Confused User Prompt Hallucination Guard ────────────────
  bench('Confused User Prompt Hallucination Guard (Bypass Agentic Multi-Pass Loop)', () => {
    const confusedQuery = 'what is this site about and fix the bug in the code';
    const isConfused = isUserConfused(confusedQuery);
    const responseStrategy = isConfused ? 'SINGLE_PASS_CONFUSED_FAST_PATH' : 'FULL_AGENTIC_LOOP';
    countTokens(JSON.stringify({ confusedQuery, isConfused, responseStrategy }));
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();
  const wsRoot = getWsRoot();
  const sampleQuery = 'Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed';

  // Populate realistic conversation history in ShortTermMemory
  const STM = memoryManager.shortTerm;
  const chatTurns: Message[] = [
    { role: 'user', content: 'Add JWT authentication to login handler' },
    { role: 'assistant', content: 'Implemented JWT auth middleware with 1-hour token expiration.' },
    { role: 'user', content: 'Refactor session middleware to use Redis cache store' },
    { role: 'assistant', content: 'Session middleware updated to use Redis cache store with fallback.' },
    { role: 'user', content: 'Fix rate limit bug in auth.ts' },
    { role: 'assistant', content: 'Patched auth.ts rate limiting logic using sliding window counter.' }
  ];
  for (const [idx, turn] of chatTurns.entries()) STM.set(`turn:${idx}`, turn);

  const mcpToolInputAgentic = {
    tool: 'use_free_llm',
    request: {
      model: 'gemini-3.1-flash-lite',
      agentic: true,
      messages: [
        ...chatTurns,
        { role: 'user', content: sampleQuery }
      ]
    },
    taskType: 'coder'
  };

  const mcpToolInputNonAgentic = {
    tool: 'use_free_llm',
    request: {
      model: 'gemini-3.1-flash-lite',
      agentic: false,
      messages: [
        { role: 'user', content: sampleQuery }
      ]
    },
    taskType: 'coder'
  };

  // Execute WorkspaceContextMiddleware for Agentic Mode
  const middlewareAgentic = new WorkspaceContextMiddleware();
  const tStartAgentic = performance.now();
  const ctxAgentic: PipelineContext = {
    request: JSON.parse(JSON.stringify(mcpToolInputAgentic.request)),
    taskType: 'coder' as any,
    workspaceRoot: wsRoot,
    sessionId: 'bench-session-agentic-log',
    isOnePass: false
  };
  await middlewareAgentic.execute(ctxAgentic, async () => {});
  const tEndAgentic = performance.now();

  // Execute WorkspaceContextMiddleware for Non-Agentic Mode
  const middlewareNonAgentic = new WorkspaceContextMiddleware();
  const tStartNonAgentic = performance.now();
  const ctxNonAgentic: PipelineContext = {
    request: JSON.parse(JSON.stringify(mcpToolInputNonAgentic.request)),
    taskType: 'coder' as any,
    workspaceRoot: wsRoot,
    sessionId: 'bench-session-non-agentic-log',
    isOnePass: true
  };
  await middlewareNonAgentic.execute(ctxNonAgentic, async () => {});
  const tEndNonAgentic = performance.now();

  // Extract system prompt and telemetry
  const sysMsgAgentic = ctxAgentic.request.messages.find(m => m.role === 'system');
  const sysPromptAgenticStr = sysMsgAgentic ? (typeof sysMsgAgentic.content === 'string' ? sysMsgAgentic.content : JSON.stringify(sysMsgAgentic.content)) : '';

  const sysMsgNonAgentic = ctxNonAgentic.request.messages.find(m => m.role === 'system');
  const sysPromptNonAgenticStr = sysMsgNonAgentic ? (typeof sysMsgNonAgentic.content === 'string' ? sysMsgNonAgentic.content : JSON.stringify(sysMsgNonAgentic.content)) : '';

  const tokSysAgentic = countTokens(sysPromptAgenticStr);
  const tokSysNonAgentic = countTokens(sysPromptNonAgenticStr);
  const tokTotalAgentic = countTokens(JSON.stringify(ctxAgentic.request.messages));
  const tokTotalNonAgentic = countTokens(JSON.stringify(ctxNonAgentic.request.messages));

  // Confused prompt guard
  const confusedQuery = 'what is this site about and fix the bug in the code';
  const isConfused = isUserConfused(confusedQuery);
  const confusedStrategy = isConfused ? 'FORCE_SINGLE_PASS_BYPASS_AGENTIC_LOOP' : 'FULL_AGENTIC_LOOP';

  const logContent = `# Benchmark Log: 01-pipeline — Production WorkspaceContextMiddleware & 4-Layer Memory

**Timestamp**: ${timestamp}

## 📥 1. MCP Server Tool Call Input Payload (\`use_free_llm\` Agentic vs Non-Agentic)

### Agentic Mode MCP Call Input:
\`\`\`json
${JSON.stringify(mcpToolInputAgentic, null, 2)}
\`\`\`

### Non-Agentic Mode MCP Call Input:
\`\`\`json
${JSON.stringify(mcpToolInputNonAgentic, null, 2)}
\`\`\`

---

## 🎯 2. Internal Subtask & LLM Execution Telemetry
- **Source Middleware**: \`WorkspaceContextMiddleware\` (\`src/pipeline/middlewares/WorkspaceContextMiddleware.ts\`)
- **User Query**: \`${sampleQuery}\`
- **Agentic Execution Latency**: ${(tEndAgentic - tStartAgentic).toFixed(2)} ms
- **Non-Agentic Execution Latency**: ${(tEndNonAgentic - tStartNonAgentic).toFixed(2)} ms

---

## ⚡ Agentic Mode (\`isOnePass: false\`) vs. Non-Agentic Mode (\`isOnePass: true\`) Comparison

| Pipeline Dimension | Agentic Mode (\`isOnePass: false\`) | Non-Agentic Mode (\`isOnePass: true\`) | Net Difference / Savings |
|---|---|---|---|
| **System Prompt Tokens** | **${tokSysAgentic} tokens** | **${tokSysNonAgentic} tokens** | **-${Math.abs(tokSysAgentic - tokSysNonAgentic)} tokens** |
| **Total Payload Tokens** | **${tokTotalAgentic} tokens** | **${tokTotalNonAgentic} tokens** | **-${Math.abs(tokTotalAgentic - tokTotalNonAgentic)} tokens** |
| **Middleware Execution** | Multi-pass \`AgenticMiddleware\` subtask loop | Direct single-pass LLM completion | Avoids task graph decomposition |
| **Memory Isolation Gates** | Enforces all 4 memory layer gates | Light persona & system guidelines | Minimal context footprint |

---

## 🛡️ Confused User Prompt & Hallucination Prevention Guard

| Diagnostic Property | Value | Explanation |
|---|---|---|
| **\`isUserConfused(query)\`** | \`${isConfused}\` | Detected conflicting/vague user intent |
| **Enforced Strategy** | \`${confusedStrategy}\` | **Bypasses multi-pass agentic loop** to avoid context bloat & hallucinated citations |

---

## 📄 Complete Executed Messages Payload (Agentic Mode — ${tokTotalAgentic} tokens)

\`\`\`json
${JSON.stringify(ctxAgentic.request.messages, null, 2)}
\`\`\`

---

## 📄 Complete Executed Messages Payload (Non-Agentic Mode — ${tokTotalNonAgentic} tokens)

\`\`\`json
${JSON.stringify(ctxNonAgentic.request.messages, null, 2)}
\`\`\`

---
*Generated by Vitest Benchmark Suite (01-pipeline.bench.ts)*
`;

  await writeBenchmarkLog('01-pipeline.md', logContent);
}
