import { bench, describe } from "vitest";
import { cyberTool } from "../src/tools/cyber-tool.js";
import { RepositoryGraph } from "../src/memory/dependency-scanner.js";
import { WikiMemory } from "../src/memory/wiki.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";

// Ensure benchmark output log is populated
generateLogReport().catch(console.error);

describe("03-cyber-tool benchmarks", () => {
  // Scenario 1: CTF Task-Graph Node Serialization (10 nodes)
  bench("CTF Task-Graph Node Serialization (10 nodes)", () => {
    const graph = new RepositoryGraph("cyber-tools");
    const types: Array<"goal" | "hypothesis" | "action" | "finding" | "deadend"> = [
      "goal",
      "hypothesis",
      "action",
      "finding",
      "deadend",
    ];

    for (let i = 0; i < 10; i++) {
      const ctfType = types[i % types.length];
      graph.addNode(`node-${i}`, "concept", {
        ctfType,
        label: `CTF Task graph node ${i} - ${ctfType} step in security analysis`,
      });
      if (i > 0) {
        graph.addEdge(`node-${i - 1}`, `node-${i}`, "references");
      }
    }

    const serialized = graph.serialize();
    const jsonStr = JSON.stringify(serialized);
    countTokens(jsonStr);
  });

  // Scenario 2: Load Graph & Column Grouping by ctfType
  bench("Load Graph & Column Grouping by ctfType", () => {
    const graph = new RepositoryGraph("cyber-tools");
    const types: Array<"goal" | "hypothesis" | "action" | "finding" | "deadend"> = [
      "goal",
      "hypothesis",
      "action",
      "finding",
      "deadend",
    ];

    for (let i = 0; i < 10; i++) {
      const ctfType = types[i % types.length];
      graph.addNode(`node-${i}`, "concept", {
        ctfType,
        label: `CTF Task graph node ${i} - ${ctfType} step in security analysis`,
      });
    }

    const nodes = graph.getAllNodes();
    const grouped: Record<string, typeof nodes> = {
      goal: [],
      hypothesis: [],
      action: [],
      finding: [],
      deadend: [],
    };

    for (const node of nodes) {
      const ctfType = node.metadata?.ctfType || "action";
      if (!grouped[ctfType]) {
        grouped[ctfType] = [];
      }
      grouped[ctfType].push(node);
    }

    const jsonStr = JSON.stringify(grouped);
    countTokens(jsonStr);
  });

  // Scenario 3: Wiki Lookup in Global-Cyber-Tools Namespace
  bench("Wiki Lookup in Global-Cyber-Tools Namespace", async () => {
    const res = await cyberTool({
      action: "wiki_lookup",
      toolName: "nmap",
    });
    const jsonStr = JSON.stringify(res);
    countTokens(jsonStr);
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  // Pre-populate wiki content for nmap so wiki_lookup succeeds
  const wiki = new WikiMemory("cyber-tools");
  await wiki.write(
    "nmap/flags_and_troubleshooting",
    "# Nmap Flags & Troubleshooting\n\n- `-sV`: Version detection\n- `-sC`: Default scripts\n- `-p-`: Scan all ports\n\nTroubleshooting: Ensure raw socket capabilities or run with sudo.",
    ["cyber", "nmap"]
  );

  // Measure Scenario 1
  const t0 = performance.now();
  const graph1 = new RepositoryGraph("cyber-tools");
  const types: Array<"goal" | "hypothesis" | "action" | "finding" | "deadend"> = [
    "goal",
    "hypothesis",
    "action",
    "finding",
    "deadend",
  ];
  for (let i = 0; i < 10; i++) {
    const ctfType = types[i % types.length];
    graph1.addNode(`node-${i}`, "concept", {
      ctfType,
      label: `CTF Task graph node ${i} - ${ctfType} step in security analysis`,
    });
    if (i > 0) {
      graph1.addEdge(`node-${i - 1}`, `node-${i}`, "references");
    }
  }
  const serialized = graph1.serialize();
  const serializedJson = JSON.stringify(serialized);
  const serializedTokens = countTokens(serializedJson);
  const t1 = performance.now();

  // Measure Scenario 2
  const t2 = performance.now();
  const nodes = graph1.getAllNodes();
  const grouped: Record<string, typeof nodes> = {
    goal: [],
    hypothesis: [],
    action: [],
    finding: [],
    deadend: [],
  };
  for (const node of nodes) {
    const ctfType = node.metadata?.ctfType || "action";
    if (!grouped[ctfType]) {
      grouped[ctfType] = [];
    }
    grouped[ctfType].push(node);
  }
  const groupedJson = JSON.stringify(grouped);
  const groupedTokens = countTokens(groupedJson);
  const t3 = performance.now();

  // Measure Scenario 3
  const t4 = performance.now();
  const lookupRes = await cyberTool({
    action: "wiki_lookup",
    toolName: "nmap",
  });
  const lookupJson = JSON.stringify(lookupRes);
  const lookupTokens = countTokens(lookupJson);
  const t5 = performance.now();

  const logContent = `# Benchmark Log: 03-cyber-tool

**Timestamp**: ${timestamp}

## Scenarios Executed

1. **CTF Task-Graph Node Serialization (10 nodes)**
   - Latency: ${(t1 - t0).toFixed(2)} ms
   - Serialized Node Count: ${serialized.nodes.length}
   - Serialized Edge Count: ${serialized.edges.length}
   - Token Count: ${serializedTokens} tokens

2. **Load Graph & Column Grouping by ctfType**
   - Latency: ${(t3 - t2).toFixed(2)} ms
   - Nodes Grouped: ${nodes.length}
   - Column Groups: ${Object.keys(grouped).join(", ")}
   - Grouped Data Tokens: ${groupedTokens} tokens

3. **Wiki Lookup in Global-Cyber-Tools Namespace**
   - Latency: ${(t5 - t4).toFixed(2)} ms
   - Tool Name: nmap
   - Page Found: ${lookupRes.success}
   - Result Token Count: ${lookupTokens} tokens

---
*Generated by Vitest Benchmark Suite (03-cyber-tool.bench.ts)*
`;

  await writeBenchmarkLog("03-cyber-tool.md", logContent);
}
