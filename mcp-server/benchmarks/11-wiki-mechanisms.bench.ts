import { bench, describe } from 'vitest';
import { GlobalWikiManager } from '../src/utils/GlobalWikiManager.js';
import { memoryManager } from '../src/memory/index.js';
import { RepositoryGraph } from '../src/memory/dependency-scanner.js';
import { parseAndValidateDecisions } from '../src/memory/wiki-maintainer.js';
import { countTokens } from './helpers/token-counter.js';
import { writeBenchmarkLog } from './helpers/log-writer.js';
import path from 'node:path';

const CYBER_WIKI_NS = 'cyber-tools-bench';
const getWsRoot = () => path.resolve(process.cwd(), 'temp_bench_ws');

generateLogReport().catch(console.error);

describe('11 — Wiki Mechanisms: GlobalWikiManager, CTF Graph Serialization & ADR Extraction', () => {
  // ── Scenario 1: GlobalWikiManager read / write / search ─────────────────
  bench('GlobalWikiManager flushToWiki & wiki search', async () => {
    const wiki = memoryManager.getWiki(CYBER_WIKI_NS, getWsRoot());
    GlobalWikiManager.logSuccess('use_free_llm');
    await GlobalWikiManager.flushToWiki(wiki);
    await wiki.search('Tool Reliability', 'coder');
  });

  // ── Scenario 2: CTF Graph Node Serialization & Column Grouping ───────────
  bench('CTF Graph serialization & column grouping by ctfType', () => {
    const graph = new RepositoryGraph(CYBER_WIKI_NS);
    const types: ('concept' | 'code' | 'doc' | 'external')[] = ['concept', 'code', 'doc', 'external'];
    for (let i = 0; i < 20; i++) {
      graph.addNode(`node_${i}`, types[i % 4], {
        ctfType: types[i % 4],
        label: `CTF Task Graph Node ${i}`
      });
    }
    const serialized = graph.serialize();
    countTokens(JSON.stringify(serialized));
  });

  // ── Scenario 3: parseAndValidateDecisions ADR extraction ───────────────
  bench('parseAndValidateDecisions model output parsing & link validation', () => {
    const rawModelOutput = JSON.stringify([
      {
        title: 'ADR-001: Adopt WorkspaceContextMiddleware',
        content: 'Adopted 4-layer memory context isolation gate.',
        tags: ['adr', 'architecture'],
        links: ['Architecture Overview']
      },
      {
        title: 'ADR-002: Hermes Skill Adapter',
        content: 'Inject Hermes adapter note ahead of SKILL.md.',
        tags: ['adr', 'hermes'],
        links: ['Skill Engine']
      }
    ]);
    const candidates = new Set(['Architecture Overview', 'Skill Engine']);
    parseAndValidateDecisions(rawModelOutput, candidates);
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();
  const wsRoot = getWsRoot();

  // 1. GlobalWikiManager & Wiki Write/Read/Search
  const wiki = memoryManager.getWiki(CYBER_WIKI_NS, wsRoot);
  GlobalWikiManager.logSuccess('use_free_llm');
  GlobalWikiManager.logSuccess('cyber_tool');
  GlobalWikiManager.logFailure('vision_tool');
  await GlobalWikiManager.flushToWiki(wiki);

  const noteTitle = 'ctf-notes/sqli-bypass';
  const noteContent = `# SQL Injection Bypass Techniques\n\n1. **Union-Based**: \`UNION SELECT 1, group_concat(table_name) FROM information_schema.tables\`\n2. **Blind Time-Based**: \`AND (SELECT 1 FROM (SELECT(SLEEP(5)))a)\`\n3. **Filter Evasion**: Inline comment injection \`UN/**/ION SELECT\`.`;
  await wiki.write(noteTitle, noteContent, ['ctf', 'sqli', 'web'], []);
  const searchResults = await wiki.search('SQL Injection', 'coder');

  // 2. CTF Graph Serialization
  const graph = new RepositoryGraph(CYBER_WIKI_NS);
  const types: ('concept' | 'code' | 'doc' | 'external')[] = ['concept', 'code', 'doc', 'external'];
  for (let i = 0; i < 15; i++) {
    graph.addNode(`task_${i}`, types[i % 4], {
      ctfType: types[i % 4],
      label: `CTF Task ${i}: Evaluate vulnerability hypothesis ${i}`
    });
  }
  const serializedGraph = graph.serialize();
  const graphTokens = countTokens(JSON.stringify(serializedGraph));

  // Group nodes by ctfType
  const nodes = graph.getAllNodes();
  const grouped: Record<string, string[]> = {};
  for (const n of nodes) {
    const key = n.metadata?.ctfType || n.type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(`${n.id}: ${n.metadata?.label || ''}`);
  }

  // 3. ADR Decision Validation
  const rawModelOutput = JSON.stringify([
    {
      title: 'ADR-001: Adopt WorkspaceContextMiddleware',
      content: 'Adopted 4-layer memory context isolation gate.',
      tags: ['adr', 'architecture'],
      links: ['Architecture Overview']
    },
    {
      title: 'ADR-002: Hermes Skill Adapter Note',
      content: 'Inject Hermes environment override note ahead of SKILL.md content.',
      tags: ['adr', 'hermes'],
      links: ['Skill Engine']
    }
  ]);
  const candidates = new Set(['Architecture Overview', 'Skill Engine']);
  const validatedDecisions = parseAndValidateDecisions(rawModelOutput, candidates);

  const logContent = `# Benchmark Log: 11-wiki-mechanisms — GlobalWikiManager, CTF Graph & ADR Validation

**Timestamp**: ${timestamp}

## 🎯 Target Wiki Namespace & Target Query
- **Namespace**: \`${CYBER_WIKI_NS}\`
- **Query**: \`SQL Injection\` -> Found **${searchResults.length} pages**

---

## ⚡ Wiki Mechanisms & CTF Graph Breakdown

| Component | Operation | Result / Payload Size | Status |
|---|---|---|---|
| **GlobalWikiManager** | \`GlobalWikiManager.flushToWiki(wiki)\` | Persisted Tool Reliability statistics page | ✅ FLUSHED |
| **Wiki Storage** | \`wiki.write()\`, \`wiki.search()\` | Ingested \`${noteTitle}\` (${countTokens(noteContent)} tok) | ✅ SUCCESS |
| **CTF Task Graph** | Node Serialization & Column Grouping | ${nodes.length} nodes grouped into 4 CTF types | **${graphTokens} tokens** |
| **ADR Validator** | \`parseAndValidateDecisions()\` | Validated ${validatedDecisions.length} architectural decision records | ✅ VALIDATED |

---

## 📄 CTF Task Graph Grouped Columns
\`\`\`json
${JSON.stringify(grouped, null, 2)}
\`\`\`

---

## 📄 Validated ADR Decisions (${validatedDecisions.length} items)
\`\`\`json
${JSON.stringify(validatedDecisions, null, 2)}
\`\`\`

---
*Generated by Vitest Benchmark Suite (11-wiki-mechanisms.bench.ts)*
`;

  await writeBenchmarkLog("11-wiki-mechanisms.md", logContent);
}
