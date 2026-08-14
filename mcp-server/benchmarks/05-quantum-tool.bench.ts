import { bench, describe, afterAll, vi } from "vitest";
import { useCacheIsolation } from "../tests/helpers/test-cache-isolation.js";
import { quantumTool, QuantumBranch } from "../src/tools/quantum-tool.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";

useCacheIsolation();

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

describe("05-quantum-tool benchmarks (Production quantumTool Execution)", () => {
  afterAll(async () => {
    await generateLogReport();
  });

  // Scenario 1: RY Confidence Rotation Math via quantumTool Execution
  bench("quantumTool RY Rotation Step Execution & Confidence Update", async () => {
    const sessionId = `bench_ry_${Math.random()}`;
    await quantumTool({ action: "setup", sessionId, numBranches: 2, personas: ["Branch A", "Branch B"] });
    await quantumTool({
      action: "modify",
      sessionId,
      gates: [
        { qubit: 0, column: 0, gate: "RY", param: Math.PI / 4 },
        { qubit: 1, column: 0, gate: "RY", param: -Math.PI / 3 },
      ],
    });
    const res = await quantumTool({ action: "step", sessionId });
    countTokens(JSON.stringify(res));
  });

  // Scenario 2: Multi-Branch State Serialization (5 branches + gates)
  bench("Multi-Branch State Serialization (5 branches + gates)", async () => {
    const sessionId = `bench_multi_${Math.random()}`;
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
    const sessionId = `bench_analyze_${Math.random()}`;
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

  const mcpInputAnalyze = {
    tool: "quantum_tool",
    action: "analyze",
    sessionId: "log_quantum_analyze",
    query: "What is the recommended consensus strategy for migrating database schemas under high write load?"
  };

  // Scenario 1 Measurement
  const t0 = performance.now();
  const session1 = "log_quantum_ry_math";
  await quantumTool({ action: "setup", sessionId: session1, numBranches: 2, personas: ["Branch A", "Branch B"] });
  await quantumTool({
    action: "modify",
    sessionId: session1,
    gates: [
      { qubit: 0, column: 0, gate: "RY", param: Math.PI / 4 },
      { qubit: 1, column: 0, gate: "RY", param: -Math.PI / 3 },
    ],
  });
  const stepRes1 = await quantumTool({ action: "step", sessionId: session1 });
  const t1 = performance.now();
  const tok1 = countTokens(JSON.stringify(stepRes1));

  // Scenario 2 Measurement
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

  // Scenario 3 Measurement
  const t4 = performance.now();
  const session3 = "log_quantum_analyze_cost";
  const query = mcpInputAnalyze.query;
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

  const analyzeRes = await quantumTool({
    action: "analyze",
    sessionId: session3,
    query,
  });
  const t5 = performance.now();
  const analyzeOutputJson = JSON.stringify(analyzeRes);
  const analyzeOutputTokens = countTokens(analyzeOutputJson);

  const logContent = `# Benchmark Log: 05-quantum-tool — Production quantumTool Execution

**Timestamp**: ${timestamp}

## 📥 1. MCP Server Tool Call Input Payload (\`quantum_tool\` analyze)
\`\`\`json
${JSON.stringify(mcpInputAnalyze, null, 2)}
\`\`\`

---

## 🎯 2. Real Scenarios Executed & Quantum State Telemetry

### 1. **quantumTool RY Rotation Step Execution & Confidence Update**
- **Latency**: ${(t1 - t0).toFixed(2)} ms
- **Input Gates**: \`[RY(qubit=0, param=π/4), RY(qubit=1, param=-π/3)]\`
- **Token Count**: ${tok1} tokens
- **Output State**:
\`\`\`json
${JSON.stringify(stepRes1.state || stepRes1, null, 2)}
\`\`\`

---

### 2. **Multi-Branch State Serialization & Quantum Circuit Visualization**
- **Latency**: ${(t3 - t2).toFixed(2)} ms
- **Branch Count**: ${stateRes.state?.branches?.length || 5}
- **Gate Count**: ${stateRes.state?.gates?.length || 5}
- **State Token Count**: ${serializationTokens} tokens

#### 📊 Quantum Circuit State Diagram
\`\`\`mermaid
graph LR
  subgraph Qubits
    Q0["Qubit 0 (Architect)"] --> H0["H Gate"] --> CNOT0["CNOT Control"]
    Q1["Qubit 1 (Security)"] --> RY1["RY Gate (π/4)"]
    Q2["Qubit 2 (Performance)"] --> X2["X Gate"]
    Q3["Qubit 3 (UX)"] --> CNOT3["CNOT Target"]
    Q4["Qubit 4 (QA)"] --> RZ4["RZ Gate (π/3)"]
  end
\`\`\`

- **Serialized State Output**:
\`\`\`json
${JSON.stringify(stateRes.state || stateRes, null, 2)}
\`\`\`

---

### 3. **\`quantumTool({ action: 'analyze' })\` Synthesis Analysis**
- **Latency**: ${(t5 - t4).toFixed(2)} ms
- **Query**: "${query}"
- **Output Tokens**: ${analyzeOutputTokens} tokens
- **Synthesized Response Output**:
\`\`\`markdown
${analyzeRes.response || JSON.stringify(analyzeRes, null, 2)}
\`\`\`

---
*Generated by Vitest Benchmark Suite (05-quantum-tool.bench.ts)*
`;

  await writeBenchmarkLog("05-quantum-tool.md", logContent);
}
