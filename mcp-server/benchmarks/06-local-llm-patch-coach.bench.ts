import { bench, describe, vi } from "vitest";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";

// Sample instruction frame / patch context definitions
const sampleCoachInstructionFrame = `
You are the Local LLM Patch Coach. Your role is to guide local code modifications safely and iteratively.
Follow this 4-phase protocol:
Phase 1: Instruct - Analyze code context, user intention, and produce structured guidance.
Phase 2: Confirm - Evaluate proposed patch against user requirements and safety boundaries before execution.
Phase 3: Patch - Generate precise unified diff / edit operations matching target files.
Phase 4: Reinforce - Perform post-patch reflection, test outcome analysis, and update project memory.

Guidelines:
- Keep instruction concise and focused on high-precision changes.
- Never output malformed diffs or unverified destructive commands.
`;

const sampleConfirmationGateInput = {
  phase: "confirm",
  targetFile: "src/utils/math.ts",
  proposedPatchSummary: "Fix edge case in division by zero and round-trip float precision.",
  safetyCheckPassed: true,
  userApprovalRequired: false,
};

const samplePatchContent = `
--- src/utils/math.ts
+++ src/utils/math.ts
@@ -10,4 +10,6 @@
 export function safeDivide(a: number, b: number): number {
+  if (b === 0) return 0;
   return a / b;
 }
`;

const sampleReflectionContent = `
Phase 4 Reinforce Reflection:
- Patch applied cleanly to src/utils/math.ts.
- Division by zero safety check passed all unit tests.
- Memory record updated: math.ts safeDivide contract verified.
`;

const ollamaModelCandidates = [
  { name: "qwen2.5-coder:7b", latencyMs: 320, tokenCost: 145, precisionScore: 0.95 },
  { name: "deepseek-r1:7b", latencyMs: 410, tokenCost: 180, precisionScore: 0.93 },
  { name: "llama3.1:8b", latencyMs: 350, tokenCost: 160, precisionScore: 0.88 },
  { name: "codellama:7b", latencyMs: 380, tokenCost: 175, precisionScore: 0.84 },
];

// Pre-populate benchmark output log
generateLogReport().catch(console.error);

describe("06-local-llm-patch-coach benchmarks", () => {
  // Scenario 1: Phase 1 Coach Instruction Frame Token Cost
  bench("Phase 1 Coach Instruction Frame Token Cost", () => {
    const tokens = countTokens(sampleCoachInstructionFrame);
    JSON.stringify({ phase: "Phase 1: Instruct", tokens });
  });

  // Scenario 2: Phase 2 Confirmation Gate Cost
  bench("Phase 2 Confirmation Gate Cost", () => {
    const jsonStr = JSON.stringify(sampleConfirmationGateInput);
    countTokens(jsonStr);
  });

  // Scenario 3: Phase 3 Patch Token Cost
  bench("Phase 3 Patch Token Cost", () => {
    countTokens(samplePatchContent);
  });

  // Scenario 4: Phase 4 Reinforce Reflection Token Cost
  bench("Phase 4 Reinforce Reflection Token Cost", () => {
    countTokens(sampleReflectionContent);
  });

  // Scenario 5: Ollama Model Candidate Ranking
  bench("Ollama Model Candidate Ranking", () => {
    const ranked = [...ollamaModelCandidates].sort(
      (a, b) => b.precisionScore / (a.latencyMs * a.tokenCost) - a.precisionScore / (b.latencyMs * b.tokenCost)
    );
    const jsonStr = JSON.stringify(ranked);
    countTokens(jsonStr);
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  // Phase 1 Measurement
  const t0 = performance.now();
  const phase1Tokens = countTokens(sampleCoachInstructionFrame);
  const t1 = performance.now();

  // Phase 2 Measurement
  const t2 = performance.now();
  const phase2Json = JSON.stringify(sampleConfirmationGateInput);
  const phase2Tokens = countTokens(phase2Json);
  const t3 = performance.now();

  // Phase 3 Measurement
  const t4 = performance.now();
  const phase3Tokens = countTokens(samplePatchContent);
  const t5 = performance.now();

  // Phase 4 Measurement
  const t6 = performance.now();
  const phase4Tokens = countTokens(sampleReflectionContent);
  const t7 = performance.now();

  // Candidate Ranking Measurement
  const t8 = performance.now();
  const rankedCandidates = [...ollamaModelCandidates].sort((a, b) => {
    const scoreA = (a.precisionScore * 1000) / (a.latencyMs * 0.5 + a.tokenCost * 0.5);
    const scoreB = (b.precisionScore * 1000) / (b.latencyMs * 0.5 + b.tokenCost * 0.5);
    return scoreB - scoreA;
  });
  const t9 = performance.now();

  const totalWorkflowTokens = phase1Tokens + phase2Tokens + phase3Tokens + phase4Tokens;

  const candidateSummary = rankedCandidates
    .map(
      (c, i) =>
        `${i + 1}. **${c.name}** - Precision: ${c.precisionScore}, Est. Latency: ${c.latencyMs}ms, Token Cost: ${c.tokenCost} tok`
    )
    .join("\n   ");

  const logContent = `# Benchmark Log: 06-local-llm-patch-coach

**Timestamp**: ${timestamp}

## Scenarios Executed

1. **Phase 1: Coach Instruction Frame Token Cost**
   - Latency: ${(t1 - t0).toFixed(2)} ms
   - Token Count: ${phase1Tokens} tokens

2. **Phase 2: Confirmation Gate Cost**
   - Latency: ${(t3 - t2).toFixed(2)} ms
   - Input Payload Token Count: ${phase2Tokens} tokens

3. **Phase 3: Patch Token Cost**
   - Latency: ${(t5 - t4).toFixed(2)} ms
   - Sample Unified Diff Token Count: ${phase3Tokens} tokens

4. **Phase 4: Reinforce Reflection Token Cost**
   - Latency: ${(t7 - t6).toFixed(2)} ms
   - Reflection Payload Token Count: ${phase4Tokens} tokens

5. **Total 4-Phase Workflow Token Cost**
   - Total Tokens: ${totalWorkflowTokens} tokens

6. **Ollama Model Candidate Ranking**
   - Latency: ${(t9 - t8).toFixed(2)} ms
   - Candidates Evaluated: ${ollamaModelCandidates.length}
   - Ranked List:
   ${candidateSummary}

---
*Generated by Vitest Benchmark Suite (06-local-llm-patch-coach.bench.ts)*
`;

  await writeBenchmarkLog("06-local-llm-patch-coach.md", logContent);
}
