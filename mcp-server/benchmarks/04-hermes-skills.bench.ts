import { bench, describe, afterAll, vi } from "vitest";
import { useCacheIsolation } from "../tests/helpers/test-cache-isolation.js";
import { findHermesSkill, loadHermesSkillContent } from "../src/hermes/loader.js";
import { executeSkill } from "../src/tools/execute-skill.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";
import { HERMES_ADAPTER_NOTE } from "./helpers/hermes-constants.js";

useCacheIsolation();

// Mock useFreeLLM to avoid real API calls during benchmarks and log generation
vi.mock("../src/tools/use-free-llm.js", () => ({
  useFreeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "Mocked LLM execution response for benchmark testing.",
        },
      },
    ],
  }),
}));

// Mock memoryManager to avoid filesystem/wiki side effects during benchmarks
vi.mock("../src/memory/index.js", () => ({
  memoryManager: {
    getWiki: vi.fn().mockReturnValue({
      search: vi.fn().mockResolvedValue([]),
      write: vi.fn().mockResolvedValue({}),
    }),
  },
}));

describe("04-hermes-skills benchmarks", () => {
  afterAll(async () => {
    await generateLogReport();
  });

  // Scenario 1: Source Detection (Hermes vs agentic-awesome)
  bench("Hermes Skill Source Detection", async () => {
    const hermesMatch = await findHermesSkill("systematic-debugging");
    const nonexistentMatch = await findHermesSkill("nonexistent-skill-name-123");
    
    const dummyRaw = JSON.stringify({ hermesMatch, nonexistentMatch });
    countTokens(dummyRaw);
  });

  // Scenario 2: Adapter Injection Token Overhead
  bench("Adapter Injection Token Overhead", async () => {
    const skillContent = await loadHermesSkillContent("systematic-debugging");
    const rawContent = skillContent?.content || "";
    const adaptedContent = HERMES_ADAPTER_NOTE + rawContent;

    const rawTokens = countTokens(rawContent);
    const adaptedTokens = countTokens(adaptedContent);
    const overheadTokens = adaptedTokens - rawTokens;

    const dummyRaw = JSON.stringify({ rawTokens, adaptedTokens, overheadTokens });
    countTokens(dummyRaw);
  });

  // Scenario 3: execute_skill End-to-End Token Cost
  bench("execute_skill End-to-End Token Cost", async () => {
    const res = await executeSkill({
      skill: "systematic-debugging",
      input: "Debug an unexpected null pointer exception in user authentication flow.",
    });

    const jsonStr = JSON.stringify(res);
    countTokens(jsonStr);
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  const mcpToolInputPayload = {
    tool: "execute_skill",
    skill: "systematic-debugging",
    input: "Debug an unexpected null pointer exception in user authentication flow."
  };

  // Measure Scenario 1: Source Detection
  const t0 = performance.now();
  const hermesMatch = await findHermesSkill("systematic-debugging");
  const nonexistentMatch = await findHermesSkill("nonexistent-skill-name-123");
  const t1 = performance.now();
  const detectionJson = JSON.stringify({ hermesMatch, nonexistentMatch });
  const detectionTokens = countTokens(detectionJson);

  // Measure Scenario 2: Adapter Injection Overhead
  const t2 = performance.now();
  const loadedSkill = await loadHermesSkillContent("systematic-debugging");
  const rawContent = loadedSkill?.content || "# Dummy Hermes Skill Content";
  const adaptedContent = HERMES_ADAPTER_NOTE + rawContent;

  const rawTokens = countTokens(rawContent);
  const adaptedTokens = countTokens(adaptedContent);
  const adapterNoteTokens = countTokens(HERMES_ADAPTER_NOTE);
  const overheadTokens = adaptedTokens - rawTokens;
  const t3 = performance.now();

  // Measure Scenario 3: execute_skill End-to-End
  const t4 = performance.now();
  const executeRes = await executeSkill(mcpToolInputPayload as any);
  const t5 = performance.now();
  const executeJson = JSON.stringify(executeRes);
  const executeTokens = countTokens(executeJson);

  const internalPromptPayload = {
    systemPrompt: HERMES_ADAPTER_NOTE + rawContent,
    userPrompt: mcpToolInputPayload.input
  };

  const logContent = `# Benchmark Log: 04-hermes-skills — Skill Engine & Adapter Execution

**Timestamp**: ${timestamp}

## 📥 1. MCP Server Tool Call Input Payload (\`execute_skill\`)
\`\`\`json
${JSON.stringify(mcpToolInputPayload, null, 2)}
\`\`\`

---

## 📄 2. Internal Skill Engine System Prompt Payload
\`\`\`json
${JSON.stringify(internalPromptPayload, null, 2)}
\`\`\`

---

## ⚡ Scenarios Executed

1. **Hermes Skill Source Detection**
   - Latency: ${(t1 - t0).toFixed(2)} ms
   - Target Skill: \`systematic-debugging\`
   - Hermes Match Found: ${hermesMatch !== null} (\`${hermesMatch?.id || "N/A"}\`)
   - Non-existent Match Result: ${nonexistentMatch === null ? "null (fallback to agentic-awesome)" : "found"}
   - Output Data Token Count: ${detectionTokens} tokens

2. **Adapter Injection Token Overhead**
   - Latency: ${(t3 - t2).toFixed(2)} ms
   - Target Skill: \`systematic-debugging\`
   - Raw Skill Tokens: ${rawTokens} tokens
   - Adapted Skill Tokens: ${adaptedTokens} tokens
   - Adapter Note Tokens: ${adapterNoteTokens} tokens
   - Token Overhead Added: +${overheadTokens} tokens

3. **execute_skill End-to-End Token Cost**
   - Latency: ${(t5 - t4).toFixed(2)} ms
   - Input Skill: \`systematic-debugging\`
   - User Prompt: "${mcpToolInputPayload.input}"
   - Execution Success: ${executeRes.success}
   - Response Result Token Count: ${executeTokens} tokens

---
*Generated by Vitest Benchmark Suite (04-hermes-skills.bench.ts)*
`;

  await writeBenchmarkLog("04-hermes-skills.md", logContent);
}
