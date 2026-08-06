import { bench, describe, vi } from "vitest";
import { findHermesSkill, loadHermesSkillContent } from "../src/hermes/loader.js";
import { executeSkill } from "../src/tools/execute-skill.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";

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

// Injected adapter note matching execute-skill.ts
const HERMES_ADAPTER_NOTE = `## MCP Environment Overrides
This skill originates from the Hermes-Agent skill set, authored for a different environment. In THIS environment:
- Do NOT create files or folders directly. Use \`manage_memory\` for persistent storage instead.
- For fetching external/web data, use \`browser_tool\`.
- For searching existing code or prior notes, use the workspace context tools (grep/wiki) already available to you — not a raw filesystem search.
Follow the skill's methodology below, but execute it through this server's tools.

`;

// Ensure benchmark output log is populated
generateLogReport().catch(console.error);

describe("04-hermes-skills benchmarks", () => {
  // Scenario 1: Source Detection (Hermes vs agentic-awesome)
  bench("Hermes Skill Source Detection", async () => {
    // 1. Detect existing Hermes skill
    const hermesMatch = await findHermesSkill("systematic-debugging");
    // 2. Detect non-existent Hermes skill (falls back to agentic-awesome / null)
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
  const executeRes = await executeSkill({
    skill: "systematic-debugging",
    input: "Debug an unexpected null pointer exception in user authentication flow.",
  });
  const t5 = performance.now();
  const executeJson = JSON.stringify(executeRes);
  const executeTokens = countTokens(executeJson);

  const logContent = `# Benchmark Log: 04-hermes-skills

**Timestamp**: ${timestamp}

## Scenarios Executed

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
   - User Prompt: "Debug an unexpected null pointer exception in user authentication flow."
   - Execution Success: ${executeRes.success}
   - Response Result Token Count: ${executeTokens} tokens

---
*Generated by Vitest Benchmark Suite (04-hermes-skills.bench.ts)*
`;

  await writeBenchmarkLog("04-hermes-skills.md", logContent);
}
