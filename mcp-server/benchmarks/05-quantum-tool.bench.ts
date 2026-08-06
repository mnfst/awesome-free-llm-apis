import { bench, describe, vi } from "vitest";
import { quantumTool, QuantumBranch } from "../src/tools/quantum-tool.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";

// Mock useFreeLLM to avoid actual network/LLM API calls during benchmark runs
vi.mock("../src/tools/use-free-llm.js", () => ({
  useFreeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "Synthesized quantum reasoning response across all active branches.",
        },
      },
    ],
  }),
}));

// Helper function implementing exact RY rotation math for round-trip fidelity testing
function ryMathRoundTrip(initialConfidence: number, theta: number): { recoveredConfidence: number; diff: number } {
  // phi = 2 * asin(sqrt(confidence))
  const phi = 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, initialConfidence))));
  const newPhi = phi + theta;
  // confidence = sin(phi / 2)^2
  const newConfidence = Math.sin(newPhi / 2) ** 2;

  // Round-trip back by applying -theta
  const phiRound = 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, newConfidence))));
  const restoredPhi = phiRound - theta;
  const recoveredConfidence = Math.sin(restoredPhi / 2) ** 2;

  const diff = Math.abs(initialConfidence - recoveredConfidence);
  return { recoveredConfidence, diff };
}

// Pre-populate benchmark output log
generateLogReport().catch(console.error);

describe("05-quantum-tool benchmarks", () => {
  // Scenario 1: RY Confidence Math Round-Trip Fidelity
  bench("RY Confidence Math Round-Trip Fidelity", () => {
    const testConfidences = [0.1, 0.25, 0.5, 0.75, 0.9];
    const testThetas = [Math.PI / 6, Math.PI / 4, Math.PI / 2, -Math.PI / 3];

    let totalDiff = 0;
    let opsCount = 0;

    for (const conf of testConfidences) {
      for (const theta of testThetas) {
        const { diff } = ryMathRoundTrip(conf, theta);
        totalDiff += diff;
        opsCount++;
      }
    }

    const avgDiff = totalDiff / opsCount;
    const jsonStr = JSON.stringify({ opsCount, avgDiff });
    countTokens(jsonStr);
  });

  // Scenario 2: Multi-Branch State Serialization (5 branches + gates)
  bench("Multi-Branch State Serialization (5 branches + gates)", async () => {
    const sessionId = "bench_quantum_multi_branch";
    await quantumTool({
      action: "setup",
      sessionId,
      numBranches: 5,
      personas: ["Architect", "Security", "Performance", "UX", "QA"],
    });

    await quantumTool({
      action: "modify",
      sessionId,
      gates: [
        { qubit: 0, column: 0, gate: "H" },
        { qubit: 1, column: 0, gate: "RY", param: Math.PI / 4 },
        { qubit: 2, column: 1, gate: "X" },
        { qubit: 0, column: 2, gate: "CNOT", target: 3 },
        { qubit: 4, column: 2, gate: "RZ", param: Math.PI / 3 },
      ],
    });

    await quantumTool({ action: "step", sessionId });
    await quantumTool({ action: "step", sessionId });

    const stateRes = await quantumTool({ action: "get_state", sessionId });
    const serializedJson = JSON.stringify(stateRes.state);
    countTokens(serializedJson);
  });

  // Scenario 3: Analyze Synthesis Prompt Token Cost
  bench("Analyze Synthesis Prompt Token Cost", async () => {
    const sessionId = "bench_quantum_analyze_cost";
    await quantumTool({
      action: "setup",
      sessionId,
      numBranches: 3,
      personas: ["Optimistic", "Pessimistic", "Pragmatic"],
    });

    await quantumTool({
      action: "modify",
      sessionId,
      gates: [
        { qubit: 0, column: 0, gate: "RY", param: Math.PI / 3 },
        { qubit: 1, column: 0, gate: "RY", param: -Math.PI / 4 },
      ],
    });

    await quantumTool({ action: "step", sessionId });

    const analyzeRes = await quantumTool({
      action: "analyze",
      sessionId,
      query: "What is the recommended consensus strategy for migrating database schemas under high write load?",
    });

    const jsonStr = JSON.stringify(analyzeRes);
    countTokens(jsonStr);
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  // Scenario 1: RY Confidence Math Round-Trip Fidelity measurement
  const t0 = performance.now();
  const testConfidences = [0.1, 0.25, 0.5, 0.75, 0.9];
  const testThetas = [Math.PI / 6, Math.PI / 4, Math.PI / 2, -Math.PI / 3];

  let maxDiff = 0;
  let totalDiff = 0;
  let opsCount = 0;

  for (const conf of testConfidences) {
    for (const theta of testThetas) {
      const { diff } = ryMathRoundTrip(conf, theta);
      if (diff > maxDiff) maxDiff = diff;
      totalDiff += diff;
      opsCount++;
    }
  }
  const avgDiff = totalDiff / opsCount;
  const t1 = performance.now();

  // Scenario 2: Multi-Branch State Serialization measurement
  const t2 = performance.now();
  const session2 = "log_quantum_multi_branch";
  await quantumTool({
    action: "setup",
    sessionId: session2,
    numBranches: 5,
    personas: ["Architect", "Security", "Performance", "UX", "QA"],
  });

  await quantumTool({
    action: "modify",
    sessionId: session2,
    gates: [
      { qubit: 0, column: 0, gate: "H" },
      { qubit: 1, column: 0, gate: "RY", param: Math.PI / 4 },
      { qubit: 2, column: 1, gate: "X" },
      { qubit: 0, column: 2, gate: "CNOT", target: 3 },
      { qubit: 4, column: 2, gate: "RZ", param: Math.PI / 3 },
    ],
  });

  await quantumTool({ action: "step", sessionId: session2 });
  await quantumTool({ action: "step", sessionId: session2 });

  const stateRes = await quantumTool({ action: "get_state", sessionId: session2 });
  const t3 = performance.now();
  const serializedJson = JSON.stringify(stateRes.state);
  const serializationTokens = countTokens(serializedJson);

  // Scenario 3: Analyze Synthesis Prompt Token Cost measurement
  const t4 = performance.now();
  const session3 = "log_quantum_analyze_cost";
  const query = "What is the recommended consensus strategy for migrating database schemas under high write load?";
  await quantumTool({
    action: "setup",
    sessionId: session3,
    numBranches: 3,
    personas: ["Optimistic", "Pessimistic", "Pragmatic"],
  });

  await quantumTool({
    action: "modify",
    sessionId: session3,
    gates: [
      { qubit: 0, column: 0, gate: "RY", param: Math.PI / 3 },
      { qubit: 1, column: 0, gate: "RY", param: -Math.PI / 4 },
    ],
  });

  await quantumTool({ action: "step", sessionId: session3 });

  const stateBeforeAnalyze = await quantumTool({ action: "get_state", sessionId: session3 });
  const branchSummary = stateBeforeAnalyze.state.branches
    .map(
      (b: QuantumBranch) =>
        `- ${b.persona} (${b.id}): stance=${b.stance}, confidence=${b.confidence.toFixed(2)}. Evidence: ${
          b.evidence.join(" ") || "(none yet)"
        }`
    )
    .join("\n");

  const rawPrompt = `You are reasoning across ${stateBeforeAnalyze.state.branches.length} parallel perspective branches on a question, built up over ${stateBeforeAnalyze.state.step} circuit steps.\n\nBranch states:\n${branchSummary}\n\nUser question: ${query}\n\nSynthesize a reasoned answer that explicitly weighs the branches by their confidence, notes where they agree/disagree, and flags any branch still near 0.5 confidence (unresolved).`;

  const promptTokens = countTokens(rawPrompt);

  const analyzeRes = await quantumTool({
    action: "analyze",
    sessionId: session3,
    query,
  });
  const t5 = performance.now();
  const analyzeOutputJson = JSON.stringify(analyzeRes);
  const analyzeOutputTokens = countTokens(analyzeOutputJson);

  const logContent = `# Benchmark Log: 05-quantum-tool

**Timestamp**: ${timestamp}

## Scenarios Executed

1. **RY Confidence Math Round-Trip Fidelity**
   - Latency: ${(t1 - t0).toFixed(2)} ms
   - Test Operations Count: ${opsCount}
   - Max Round-Trip Error: ${maxDiff.toExponential(4)}
   - Average Error: ${avgDiff.toExponential(4)}
   - Math Formula: \`phi = 2 * asin(sqrt(confidence))\`, \`confidence = sin(phi / 2)^2\`

2. **Multi-Branch State Serialization (5 branches + gates)**
   - Latency: ${(t3 - t2).toFixed(2)} ms
   - Branch Count: ${stateRes.state.branches.length}
   - Gate Count: ${stateRes.state.gates.length}
   - Current Step: ${stateRes.state.step}
   - State JSON Size: ${serializedJson.length} bytes
   - State Token Count: ${serializationTokens} tokens

3. **Analyze Synthesis Prompt Token Cost**
   - Latency: ${(t5 - t4).toFixed(2)} ms
   - Query: "${query}"
   - Active Branches: 3 (Optimistic, Pessimistic, Pragmatic)
   - Prompt Token Count: ${promptTokens} tokens
   - Output Response Tokens: ${analyzeOutputTokens} tokens

---
*Generated by Vitest Benchmark Suite (05-quantum-tool.bench.ts)*
`;

  await writeBenchmarkLog("05-quantum-tool.md", logContent);
}
