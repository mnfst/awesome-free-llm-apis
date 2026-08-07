import { bench, describe } from 'vitest';
import { useCacheIsolation } from '../tests/helpers/test-cache-isolation.js';
import { memoryManager, selectAmplitudeLines } from '../src/memory/index.js';
import { ContextGatherer } from '../src/pipeline/middlewares/context-gatherer.js';
import { getIntelligentSystemPrompt } from '../src/pipeline/middlewares/prompts.js';
import { TaskType } from '../src/pipeline/middleware.js';
import { executeInSandbox } from '../src/sandbox/executor.js';
import { countTokens } from './helpers/token-counter.js';
import { writeBenchmarkLog } from './helpers/log-writer.js';
import type { Message } from '../src/providers/types.js';
import path from 'node:path';
import fs from 'node:fs';

const { getWsRoot } = useCacheIsolation();

generateLogReport().catch(console.error);

describe('01 — Pipeline: 4-Layer Memory Contribution & Final LLM Prompt Assembly', () => {
  // ── LAYER 1: ShortTerm ──────────────────────────────────────────────────
  bench('Layer 1: ShortTermMemory — recent conversation turns', () => {
    const STM = memoryManager.shortTerm;
    for (let i = 0; i < 50; i++) {
      STM.set(`turn:${i}`, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Conversation turn ${i} discussing WorkspaceContextMiddleware.ts memory isolation.`
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
  bench('Layer 4: Born-Rule Line Sampler — WorkspaceContextMiddleware.ts code reduction', () => {
    const targetFile = path.resolve('./src/pipeline/middlewares/WorkspaceContextMiddleware.ts');
    let lines: string[];
    try {
      lines = fs.readFileSync(targetFile, 'utf-8').split('\n');
    } catch {
      lines = Array.from({ length: 500 }, (_, i) => `// line ${i}`);
    }
    selectAmplitudeLines(lines);
  });

  // ── End-to-End Final Messages Assembly ──────────────────────────────────
  bench('End-to-End Prompt Assembly: 4 Memory Layers -> System Prompt & Messages Array', async () => {
    const query = 'Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed';
    const snippets = await ContextGatherer.gatherContext({ workspaceRoot: getWsRoot(), query, limit: 3 });
    const systemPrompt = await getIntelligentSystemPrompt({
      context: query,
      memory: snippets.join('\n'),
      workspaceRoot: getWsRoot(),
      isSubtask: false
    });

    const finalMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Recent chat turn 1: Check memory isolation' },
      { role: 'assistant', content: 'Checked. Ready for next instruction.' },
      { role: 'user', content: query }
    ];

    countTokens(JSON.stringify(finalMessages));
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();
  const wsRoot = getWsRoot();
  const sampleQuery = 'Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed';

  // ── 1. SHORT-TERM MEMORY CONTRIBUTION ────────────────────────────────────
  const STM = memoryManager.shortTerm;
  const chatTurns: Message[] = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `[Turn ${i}] User discussing WorkspaceContextMiddleware.ts line ${100 + i * 5} memory layer assembly.`
  }));
  for (const [idx, turn] of chatTurns.entries()) STM.set(`turn:${idx}`, turn);

  let budget = 300;
  const stmRetained: Message[] = [];
  for (let i = chatTurns.length - 1; i >= 0 && budget > 0; i--) {
    const msg = STM.get(`turn:${i}`) as Message | undefined;
    if (!msg) continue;
    const t = countTokens(msg.content as string);
    if (t > budget) break;
    budget -= t;
    stmRetained.unshift(msg);
  }

  // ── 2. LONG-TERM MEMORY CONTRIBUTION ─────────────────────────────────────
  const ltm = memoryManager.longTerm;
  const ltmData = {
    workspace: 'awesome-free-llm-apis',
    lastActiveTool: 'use_free_llm',
    savedState: 'WorkspaceContextMiddleware gathers context from 4 layers before each LLM call.',
    confidence: 0.95
  };
  await ltm.save(`state:${wsRoot}`, ltmData);
  const ltmLoaded = await ltm.load(`state:${wsRoot}`);

  // ── 3. WIKI MEMORY CONTRIBUTION ──────────────────────────────────────────
  const wiki = memoryManager.getWiki('awesome-bench', wsRoot);
  const wikiNoteTitle = 'architecture/memory-layers';
  const wikiNoteContent = `# Workspace Memory Architecture\n\n1. **ShortTermMemory**: Recent sliding window chat turns.\n2. **LongTermMemory**: Persistent tool output & state.\n3. **WikiMemory**: High-confidence markdown notes.\n4. **VectorStore**: Cosine similarity search over indexed code snippets.`;
  await wiki.write(wikiNoteTitle, wikiNoteContent, ['architecture', 'code'], []);
  const wikiSearchResults = await wiki.search(sampleQuery, 'coder');
  const wikiTopPage = wikiSearchResults[0] || await wiki.read(wikiNoteTitle);

  // ── 4. VECTORSTORE / BORN-RULE CODE CONTRIBUTION ────────────────────────
  const fileTarget = path.resolve('./src/pipeline/middlewares/WorkspaceContextMiddleware.ts');
  let rawCodeLines: string[] = [];
  try {
    rawCodeLines = fs.readFileSync(fileTarget, 'utf-8').split('\n');
  } catch {
    rawCodeLines = Array.from({ length: 400 }, (_, i) => `// line ${i}`);
  }
  const sampledCodeLines = selectAmplitudeLines(rawCodeLines);

  // ── 5. ASSEMBLE SYSTEM PROMPT & FINAL MESSAGES ARRAY ───────────────
  const memoryContextCombined = [
    `LongTerm State: ${JSON.stringify(ltmLoaded)}`,
    `Wiki Page (${wikiTopPage?.title}): ${wikiTopPage?.content}`
  ].join('\n\n');

  const finalSystemPrompt = await getIntelligentSystemPrompt({
    context: sampleQuery,
    memory: memoryContextCombined,
    workspace: `Project Structure:\n- src/pipeline/middlewares/WorkspaceContextMiddleware.ts\n- src/memory/index.ts\n\nRelevant Code Snippets:\n${sampledCodeLines.slice(0, 30).join('\n')}`,
    workspaceRoot: wsRoot,
    isSubtask: false
  });

  const finalMessagesArray: Message[] = [
    { role: 'system', content: finalSystemPrompt },
    ...stmRetained,
    { role: 'user', content: sampleQuery }
  ];

  const sysTok = countTokens(finalSystemPrompt);
  const stmTok = countTokens(stmRetained.map(m => m.content as string).join(' '));
  const queryTok = countTokens(sampleQuery);
  const totalLLMTok = sysTok + stmTok + queryTok;

  const logContent = `# Benchmark Log: 01-pipeline — 4-Layer Memory Contribution & Final LLM Prompt Assembly

**Timestamp**: ${timestamp}

## 🎯 User Query Example
\`${sampleQuery}\`

---

## 🔍 Memory Layer Contributions Breakdown

Every memory layer plays a distinct role in constructing the payload sent to the LLM:

| Memory Layer | Type / Origin | Specific Contribution to Prompt | Size Contribution |
|---|---|---|---|
| **1. ShortTermMemory** | In-Memory Chat Window | Recent user & assistant conversation turns (Sliding Window) | **${stmRetained.length} turns (${stmTok} tok)** |
| **2. LongTermMemory** | Disk JSON (\`.free-llm-mcp/\`) | Saved tool outputs, persistent workspace state & execution confidence | Injected into \`<memory_context_isolation_gate>\` |
| **3. WikiMemory** | Markdown Wiki Notes | Workspace architecture notes (\`${wikiTopPage?.title || 'architecture/memory-layers'}\`) | Injected into \`<wiki_context_isolation_gate>\` |
| **4. VectorStore / Sampler** | Cosine Index + Born-Rule | ${sampledCodeLines.length} selected lines from \`WorkspaceContextMiddleware.ts\` | Injected into \`<workspace_context_isolation_gate>\` |

---

## 🏗️ How the Final Messages Array is Assembled for the LLM

When \`provider.chat()\` is called, the pipeline constructs an array of **${finalMessagesArray.length} Message objects**:

1. **\`messages[0]\` (Role: \`system\`)** — **${sysTok} tokens**
   - Combines Target Project Guidelines (\`AGENTS.md\`), Workspace Memory (\`LongTermMemory\` + \`WikiMemory\`), Workspace Context (\`VectorStore\` snippets), Role Identity (\`# ROLE\`), and Safety Grounding (\`GROUNDING_PROTOCOL\`).

2. **\`messages[1..${finalMessagesArray.length - 2}]\` (Role: \`user\` / \`assistant\`)** — **${stmTok} tokens**
   - Ingests ${stmRetained.length} recent conversation history turns from \`ShortTermMemory\`.

3. **\`messages[${finalMessagesArray.length - 1}]\` (Role: \`user\`)** — **${queryTok} tokens**
   - The user's current incoming prompt (\`${sampleQuery}\`).

**Total Payload Size Sent to Provider**: **${totalLLMTok} tokens**

---

## 📄 Complete Assembled Messages Array (Sent to \`provider.chat()\`)

### 1. \`messages[0]\` (System Prompt — ${sysTok} tokens)
\`\`\`markdown
${finalSystemPrompt}
\`\`\`

---

### 2. Retained Conversation History (\`messages[1..${finalMessagesArray.length - 2}]\` — ${stmTok} tokens)
\`\`\`json
${JSON.stringify(stmRetained, null, 2)}
\`\`\`

---

### 3. Incoming User Prompt (\`messages[${finalMessagesArray.length - 1}]\` — ${queryTok} tokens)
\`\`\`json
${JSON.stringify({ role: 'user', content: sampleQuery }, null, 2)}
\`\`\`

---
*Generated by Vitest Benchmark Suite (01-pipeline.bench.ts)*
`;

  await writeBenchmarkLog("01-pipeline.md", logContent);
}
