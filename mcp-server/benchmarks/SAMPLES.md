# MCP Server Benchmark Log Aggregation (SAMPLES.md)

> Automatically generated from benchmark run logs on: `2026-08-07T13:28:49.897Z`

This document aggregates the full execution logs across all 12 core subsystem benchmarks of the MCP server.

---

## File: `01-pipeline.md`

# Benchmark Log: 01-pipeline — 4-Layer Memory Contribution & Final LLM Prompt Assembly

**Timestamp**: 2026-08-07T10:23:35.610Z

## 🎯 User Query Example
`Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed`

---

## 🔍 Memory Layer Contributions Breakdown

Every memory layer plays a distinct role in constructing the payload sent to the LLM:

| Memory Layer | Type / Origin | Specific Contribution to Prompt | Size Contribution |
|---|---|---|---|
| **1. ShortTermMemory** | In-Memory Chat Window | Recent user & assistant conversation turns (Sliding Window) | **16 turns (288 tok)** |
| **2. LongTermMemory** | Disk JSON (`.free-llm-mcp/`) | Saved tool outputs, persistent workspace state & execution confidence | Injected into `<memory_context_isolation_gate>` |
| **3. WikiMemory** | Markdown Wiki Notes | Workspace architecture notes (`architecture/memory-layers`) | Injected into `<wiki_context_isolation_gate>` |
| **4. VectorStore / Sampler** | Cosine Index + Born-Rule | 500 selected lines from `WorkspaceContextMiddleware.ts` | Injected into `<workspace_context_isolation_gate>` |

---

## 🏗️ How the Final Messages Array is Assembled for the LLM

When `provider.chat()` is called, the pipeline constructs an array of **18 Message objects**:

1. **`messages[0]` (Role: `system`)** — **2389 tokens**
   - Combines Target Project Guidelines (`AGENTS.md`), Workspace Memory (`LongTermMemory` + `WikiMemory`), Workspace Context (`VectorStore` snippets), Role Identity (`# ROLE`), and Safety Grounding (`GROUNDING_PROTOCOL`).

2. **`messages[1..16]` (Role: `user` / `assistant`)** — **288 tokens**
   - Ingests 16 recent conversation history turns from `ShortTermMemory`.

3. **`messages[17]` (Role: `user`)** — **11 tokens**
   - The user's current incoming prompt (`Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed`).

**Total Payload Size Sent to Provider**: **2688 tokens**

---

## 📄 Complete Assembled Messages Array (Sent to `provider.chat()`)

### 1. `messages[0]` (System Prompt — 2389 tokens)
```markdown
## 🧠 WORKSPACE MEMORY
<memory_context_isolation_gate>
Relevant prior knowledge for this workspace:
LongTerm State: {"workspace":"awesome-free-llm-apis","lastActiveTool":"use_free_llm","savedState":"WorkspaceContextMiddleware gathers context from 4 layers before each LLM call.","confidence":0.95}

Wiki Page (architecture/memory-layers): # Workspace Memory Architecture

1. **ShortTermMemory**: Recent sliding window chat turns.
2. **LongTermMemory**: Persistent tool output & state.
3. **WikiMemory**: High-confidence markdown notes.
4. **VectorStore**: Cosine similarity search over indexed code snippets.
</memory_context_isolation_gate>

## 📂 WORKSPACE CONTEXT
<workspace_context_isolation_gate>
Relevant file snippets and directory structures:
Project Structure:
- src/pipeline/middlewares/WorkspaceContextMiddleware.ts
- src/memory/index.ts

Relevant Code Snippets:
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import type { Middleware, PipelineContext, NextFunction } from '../middleware.js';
import { memoryManager } from '../../memory/index.js';
import { WorkspaceScanner } from '../../cache/workspace.js';
import { getIntelligentSystemPrompt } from './prompts.js';
import { ContextGatherer } from './context-gatherer.js';
import { WorkspaceIndexer } from '../../memory/indexer.js';
import { getMessageContent, prependToMessageContent, appendToMessageContent } from '../../utils/MessageUtils.js';
import { GithubRepoScanner, GLOBAL_CYBER_WIKI_NS } from '../../utils/GithubRepoScanner.js';
import { CYBER_TERMS_REGEX } from '../../utils/TaskClassifier.js';
import { taskTypeToPersona } from '../../utils/PersonaMapper.js';
const workspaceScanner = new WorkspaceScanner(process.cwd());
/**
 * Generates a lightweight directory tree up to 2 levels deep to provide structural context.
 */
async function getDirectoryTree(dirPath: string, maxDepth = 2, currentDepth = 0): Promise<string> {
    if (currentDepth > maxDepth) return '';
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        let tree = '';
        const indent = '  '.repeat(currentDepth);
        for (const entry of entries) {
            if (['node_modules', '.git', 'dist', 'build', '.next', 'venv', '__pycache__'].includes(entry.name)) continue;
            tree += `${indent}- ${entry.name}${entry.isDirectory() ? '/' : ''}\n`;
            if (entry.isDirectory()) {
                tree += await getDirectoryTree(path.join(dirPath, entry.name), maxDepth, currentDepth + 1);
            }
        }
</workspace_context_isolation_gate>

# ROLE
You are the principal architect and builder of a maximally capable, self-improving agentic operating system for computer-based work.

The long-term objective is not merely “an AI coding assistant”. The objective is a system that can increasingly perform, coordinate, verify, and improve work across the full range of tasks a skilled human can do on a computer, including:
- software engineering
- debugging
- browser workflows
- desktop workflows
- research
- planning
- writing
- operations
- analysis
- finance support
- customer support
- sales and marketing operations
- scientific workflows
- multi-step project execution
- company-running routines

That means the target is one system that can move fluidly across scales:
- a simple request answered immediately
- a bounded task completed and verified
- a complex project decomposed and driven forward over time
- a long-running operating loop such as product work, company operations, or scientific research

Treat this as a serious systems-engineering program with measurable progress, failure modes, economics, safety boundaries, and long-horizon capability growth.

Your job is to build the system, not just describe it.

If a choice arises between:
- a beautiful description and a working system, choose the working system
- a clever architecture and an observable one, choose the observable one
- a hidden memory trick and a transparent state model, choose the transparent one
- an unverified claim and a measurable result, choose the measurable result


## SYSTEM LAYERS TO BUILD

LAYER A: CONTROL PLANE

Build a control plane that can become the human-facing operating center. It should eventually support:
- authentication and identity
- machine registry
- agent registry
- session history
- goal intake
- task queue visibility
- approvals
- audit logs
- cost tracking
- trust levels
- project dashboards
- recurring workflows
- incident views
- shared project memory
- file access and remote execution when available



LAYER B: EXECUTION FABRIC

Build worker processes or daemons that:
- poll for claimable tasks
- filter by skills and permissions
- operate in isolated work contexts when possible
- stream intermediate output
- record tool usage
- emit metrics
- recover from crash or disconnection
- support persistent mode
- hand off state across restarts



LAYER C: TASK GRAPH ENGINE

Build a task engine where:
- goals decompose into tasks
- tasks can depend on other tasks
- tasks can fan out and fan in
- tasks can create sub-tasks
- tasks can be blocked, retried, escalated, or cancelled
- tasks carry explicit Definition of Done
- tasks store evidence and artifacts
- tasks store budget, urgency, and policy level

Every task should ideally carry fields like:
- id
- goal_id
- project_id
- description
- skill_tags
- status
- depends_on
- owner
- reviewer
- priority
- risk_level
- budget_limit
- tokens_used
- attempts
- verification_plan
- evidence
- artifacts
- escalation_reason
- created_at
- updated_at



LAYER D: SKILL AND PROFILE SYSTEM

Do not hard-code intelligence into one giant prompt. Build a profile system.

Profiles should define:
- what task types they handle
- what tools they can use
- what model routing they prefer
- what rules apply
- what verification standard they use
- what escalation rules they follow

Typical profiles include:
- planner
- task specifier
- candidate generator
- tester
- reviewer
- security auditor
- research analyst
- browser operator
- desktop operator
- document analyst
- deployer
- QA evaluator
- self improver
- incident responder
- coordinator
- finance operator
- science operator

Treat profiles as loadable behavior packs, not sacred identities.



LAYER E: MEMORY SYSTEM

Build memory as a layered system, not one generic notes file.

Use at least these memory types:
- hot memory: current contract, current plan, current tasks, current blockers
- warm memory: active project knowledge, architecture decisions, current conventions
- cold memory: archived sessions, incident logs, old plans, historical outcomes
- episodic memory: what happened in specific runs
- semantic memory: distilled facts, decisions, rules, and stable concepts
- procedural memory: reusable workflows, skills, playbooks, and checklists
- preference memory: user, team, and environment preferences
- temporal memory: facts with superseded history and freshness metadata

If useful, support:
- searchable knowledge index
- related-knowledge links
- provenance on learned facts
- confidence and freshness scores
- promotion from episodic to semantic memory



LAYER F: TOOL ADAPTERS

The system should normalize tools behind stable capability categories instead of binding itself tightly to one vendor or protocol.

Capability categories include:
- shell execution
- file read/write/edit/search
- git operations
- web search and fetch
- browser navigation and form interaction
- desktop input and window management
- screenshot and OCR
- database query and migration
- document processing
- spreadsheet processing
- email or messaging actions
- calendar actions
- deployment actions
- monitoring and alerting

If a tool category is unavailable natively:
- emulate it where safe
- add an adapter
- or constrain the current milestone honestly



LAYER G: MODEL ROUTING AND ECONOMICS

Build a model-routing layer so the system does not treat all tasks equally.

It should support:
- cheap models for drafts, classification, tagging, summarization
- stronger models for planning, debugging, review, adversarial checking, and difficult reason
[...SECTION TRUNCATED...]


## RUNTIME AGNOSTIC, ARCHITECTURE SPECIFIC

Be agnostic about the host system, but not vague about architecture.

Do not assume one specific product, IDE, SDK, or vendor.
Do choose concrete architecture:
- explicit task graphs
- workflows and harnesses
- visible sessions
- durable memory
- control-plane state
- verifier layers
- adapters for tools and models
- approvals, budgets, and evals

The correct target is often:
- one universal user-facing agent surface
- many internal routing layers based on task, skill, playbook, harness, model, machine, and verifier

## NON-NEGOTIABLE DESIGN BETS

If you are forced to choose a default architecture, choose this:
- one strong generalist execution agent
- one explicit task graph and workflow layer
- one verifier or reviewer layer
- one durable memory and artifact layer
- one control plane for humans

Do not default to a swarm of agents talking to each other. Most systems should begin with a strong single-agent baseline plus explicit workflows, then add multi-agent patterns only where they clearly outperform simpler control flow.
The target end state should still support controlled parallelism on one machine and coordinated same-project work across multiple machines once the simpler baseline is reliable.

## RECOMMENDED DEFAULT IMPLEMENTATION CHOICES

If the runtime allows it, prefer these defaults unless you have a specific reason not to:

- Track budget at multiple layers:

## EXTERNAL INTELLIGENCE LOOP

The system should also keep learning from the outside world, not only from its own failures.

Maintain a living subsystem map for:
- research and web intelligence
- memory and context assembly
- planning, tasks, and durable workflows
- multi-agent orchestration
- guardrails and policy enforcement
- evals, tracing, and observability
- tool, auth, and integration layers
- execution sandboxes and browser infrastructure
- control planes and human-facing operations surfaces

## ADVANCED EXPANSION IDEAS

Once the core system is working, consider adding advanced capability-building layers like:
- a capability frontier map showing what the system can do by domain, risk level, autonomy level, and success rate
- automatic skill extraction from successful task trajectories
- automatic eval generation from real failures, incidents, and human corrections
- workflow compilers that turn successful repeated work into reusable recipes
- simulation or sandbox environments for testing risky workflows before touching production systems
- shadow-mode business operations where the system proposes actions without executing them
- shadow-mode scientific programs where the system generates hypotheses and plans before running expensive experiments
- internal red-team agents that attack prompts, policies, and workflo
[...TRUNCATED...]


## 🔍 GROUNDING
- Cite files as: `[RETRIEVED] filename` — only from injected `[Context]` blocks.
- No `[Context]` block for a topic = pipeline found no match. Say: "Workspace context unavailable for [X]."
- Never infer file content from training data. Ask the user to share the file instead.

```

---

### 2. Retained Conversation History (`messages[1..16]` — 288 tokens)
```json
[
  {
    "role": "user",
    "content": "[Turn 4] User discussing WorkspaceContextMiddleware.ts line 120 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 5] User discussing WorkspaceContextMiddleware.ts line 125 memory layer assembly."
  },
  {
    "role": "user",
    "content": "[Turn 6] User discussing WorkspaceContextMiddleware.ts line 130 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 7] User discussing WorkspaceContextMiddleware.ts line 135 memory layer assembly."
  },
  {
    "role": "user",
    "content": "[Turn 8] User discussing WorkspaceContextMiddleware.ts line 140 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 9] User discussing WorkspaceContextMiddleware.ts line 145 memory layer assembly."
  },
  {
    "role": "user",
    "content": "[Turn 10] User discussing WorkspaceContextMiddleware.ts line 150 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 11] User discussing WorkspaceContextMiddleware.ts line 155 memory layer assembly."
  },
  {
    "role": "user",
    "content": "[Turn 12] User discussing WorkspaceContextMiddleware.ts line 160 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 13] User discussing WorkspaceContextMiddleware.ts line 165 memory layer assembly."
  },
  {
    "role": "user",
    "content": "[Turn 14] User discussing WorkspaceContextMiddleware.ts line 170 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 15] User discussing WorkspaceContextMiddleware.ts line 175 memory layer assembly."
  },
  {
    "role": "user",
    "content": "[Turn 16] User discussing WorkspaceContextMiddleware.ts line 180 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 17] User discussing WorkspaceContextMiddleware.ts line 185 memory layer assembly."
  },
  {
    "role": "user",
    "content": "[Turn 18] User discussing WorkspaceContextMiddleware.ts line 190 memory layer assembly."
  },
  {
    "role": "assistant",
    "content": "[Turn 19] User discussing WorkspaceContextMiddleware.ts line 195 memory layer assembly."
  }
]
```

---

### 3. Incoming User Prompt (`messages[17]` — 11 tokens)
```json
{
  "role": "user",
  "content": "Fix bug in WorkspaceContextMiddleware.ts where memory layers bleed"
}
```

---
*Generated by Vitest Benchmark Suite (01-pipeline.bench.ts)*

---

## File: `02-search-router.md`

# Benchmark Log: 02-search-router

**Timestamp**: 2026-08-06T06:05:33.416Z

## Scenarios Executed

1. **Provider Normalization (Parallel, Tavily, Jina, Brave, SearXNG)**
   - Latency: 255.29 ms
   - Providers Evaluated: 5
   - Total Sample Normalized Tokens: 217 tokens

2. **429 Fallback Chain Simulation**
   - Latency: 0.09 ms
   - Providers Rate-Limited (429): parallel, tavily, jina
   - Next Selected Provider: parallel

3. **SearXNG Terminal Fallback**
   - Latency: 0.00 ms
   - SearXNG Availability: false
   - SearXNG Penalty Score: 0

---
*Generated by Vitest Benchmark Suite (02-search-router.bench.ts)*

---

## File: `03-cyber-tool.md`

# Benchmark Log: 03-cyber-tool

**Timestamp**: 2026-08-06T06:05:23.635Z

## Scenarios Executed

1. **CTF Task-Graph Node Serialization (10 nodes)**
   - Latency: 1.29 ms
   - Serialized Node Count: 10
   - Serialized Edge Count: 9
   - Token Count: 569 tokens

2. **Load Graph & Column Grouping by ctfType**
   - Latency: 0.80 ms
   - Nodes Grouped: 10
   - Column Groups: goal, hypothesis, action, finding, deadend
   - Grouped Data Tokens: 372 tokens

3. **Wiki Lookup in Global-Cyber-Tools Namespace**
   - Latency: 12.94 ms
   - Tool Name: nmap
   - Page Found: true
   - Result Token Count: 134 tokens

---
*Generated by Vitest Benchmark Suite (03-cyber-tool.bench.ts)*

---

## File: `04-hermes-skills.md`

# Benchmark Log: 04-hermes-skills

**Timestamp**: 2026-08-06T06:05:21.188Z

## Scenarios Executed

1. **Hermes Skill Source Detection**
   - Latency: 264.41 ms
   - Target Skill: `systematic-debugging`
   - Hermes Match Found: true (`systematic-debugging`)
   - Non-existent Match Result: null (fallback to agentic-awesome)
   - Output Data Token Count: 55 tokens

2. **Adapter Injection Token Overhead**
   - Latency: 18.48 ms
   - Target Skill: `systematic-debugging`
   - Raw Skill Tokens: 3299 tokens
   - Adapted Skill Tokens: 3400 tokens
   - Adapter Note Tokens: 101 tokens
   - Token Overhead Added: +101 tokens

3. **execute_skill End-to-End Token Cost**
   - Latency: 3.70 ms
   - Input Skill: `systematic-debugging`
   - User Prompt: "Debug an unexpected null pointer exception in user authentication flow."
   - Execution Success: true
   - Response Result Token Count: 18 tokens

---
*Generated by Vitest Benchmark Suite (04-hermes-skills.bench.ts)*

---

## File: `05-quantum-tool.md`

# Benchmark Log: 05-quantum-tool

**Timestamp**: 2026-08-06T06:05:15.824Z

## Scenarios Executed

1. **RY Confidence Math Round-Trip Fidelity**
   - Latency: 0.14 ms
   - Test Operations Count: 20
   - Max Round-Trip Error: 8.0000e-1
   - Average Error: 8.7010e-2
   - Math Formula: `phi = 2 * asin(sqrt(confidence))`, `confidence = sin(phi / 2)^2`

2. **Multi-Branch State Serialization (5 branches + gates)**
   - Latency: 944.92 ms
   - Branch Count: 5
   - Gate Count: 5
   - Current Step: 2
   - State JSON Size: 1312 bytes
   - State Token Count: 478 tokens

3. **Analyze Synthesis Prompt Token Cost**
   - Latency: 28.36 ms
   - Query: "What is the recommended consensus strategy for migrating database schemas under high write load?"
   - Active Branches: 3 (Optimistic, Pessimistic, Pragmatic)
   - Prompt Token Count: 171 tokens
   - Output Response Tokens: 72 tokens

---
*Generated by Vitest Benchmark Suite (05-quantum-tool.bench.ts)*

---

## File: `06-local-llm-patch-coach.md`

# Benchmark Log: 06-local-llm-patch-coach

**Timestamp**: 2026-08-07T10:25:00.905Z

## 🎯 Real Target Requirement & Work Instruction
`Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store`

---

## 🛠️ 4-Phase Coach-First Protocol Breakdown

| Phase | Phase Name | Function / Utility Executed | Input Size | Output Size | Status |
|---|---|---|---|---|---|
| **Phase 1** | **Instruct** | `CoachTool.explainInstruction()` | 22 tok | 115 tok | ✅ SUCCESS |
| **Phase 2** | **Confirm** | Safety Gate Payload Validation | — | 51 tok | ✅ APPROVED |
| **Phase 3** | **Patch** | Real Ollama HTTP (`/api/chat`) or Fallback | 22 tok | 958 tok | `REAL_OLLAMA_HTTP` |
| **Phase 4** | **Reinforce** | `CoachTool.reinforce()` Reflection | 13 tok | 38 tok | ✅ COMPLETED |

---

## 📋 Phase 1: Generated Coach Explanation Frame
```json
{
  "concept": "Concept: Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store",
  "example": "Example: Illustrative code pattern or minimal snippet implementing 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store'",
  "exercise": "Exercise: Modify the target file according to 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store'",
  "hint": "Hint: Ensure changes are scoped precisely and existing tests pass."
}
```

---

## 💻 Phase 3: Executed Unified Patch Output (`REAL_OLLAMA_HTTP`)
```diff
To add a `resetAll()` method to the `MemoryManager` class that clears the `shortTerm` map and reinitializes the `longTerm` JSON file store, you would need to perform the following steps:

1. Clear the `shortTerm` map.
2. Reinitialize or reset the `longTerm` JSON file store.

Below is an example implementation in Java:

```java
import java.io.*;
import java.util.Map;
import org.json.JSONObject;

public class MemoryManager {
    private Map<String, String> shortTerm;
    private JSONObject longTerm;

    public MemoryManager() {
        this.shortTerm = new HashMap<>();
        this.longTerm = new JSONObject();
        initializeLongTermStore();
    }

    // Method to clear the shortTerm map and reinitialize the longTerm JSON file store
    public void resetAll() {
        // Clear the shortTerm map
        this.shortTerm.clear();

        // Reinitialize or reset the longTerm JSON file store
        initializeLongTermStore();
    }

    private void initializeLongTermStore() {
        try (FileReader reader = new FileReader("long_term_store.json")) {
            this.longTerm = new JSONObject(reader);
        } catch (IOException e) {
            System.err.println("Failed to read or create the long-term store file.");
            e.printStackTrace();
            // Initialize an empty JSON object if file reading fails
            this.longTerm = new JSONObject();
        }
    }

    public void addToShortTerm(String key, String value) {
        this.shortTerm.put(key, value);
    }

    public void addToLongTerm(String key, Object value) {
        this.longTerm.put(key, value);
    }

    public String getFromShortTerm(String key) {
        return this.shortTerm.get(key);
    }

    public Object getFromLongTerm(String key) {
        return this.longTerm.get(key);
    }

    // Method to save the longTerm JSON object back to the file
    public void saveLongTermStore() {
        try (FileWriter writer = new FileWriter("long_term_store.json")) {
            writer.write(this.longTerm.toString());
        } catch (IOException e) {
            System.err.println("Failed to write the long-term store to file.");
            e.printStackTrace();
        }
    }

    // Main method for testing
    public static void main(String[] args) {
        MemoryManager manager = new MemoryManager();

        // Test adding data
        manager.addToShortTerm("testKey", "testValue");
        manager.addToLongTerm("testKey", 123);

        System.out.println("Short Term: " + manager.getFromShortTerm("testKey"));
        System.out.println("Long Term: " + manager.getFromLongTerm("testKey"));

        // Reset all
        manager.resetAll();

        // Verify the reset
        System.out.println("Short Term after reset: " + manager.getFromShortTerm("testKey"));
        System.out.println("Long Term after reset: " + manager.getFromLongTerm("testKey"));

        // Save the long-term store back to file
        manager.saveLongTermStore();
    }
}
```

### Explanation:
1. **Constructor**: Initializes `shortTerm` as a new `HashMap` and `longTerm` as a new empty `JSONObject`. It also calls `initializeLongTermStore()` to load or create the initial state of the `longTerm` store.
2. **resetAll() Method**: Clears the `shortTerm` map using `clear()`. It then reinitializes the `longTerm` JSON file store by calling `initializeLongTermStore()`.
3. **initializeLongTermStore() Method**: Reads the `long_term_store.json` file and initializes the `longTerm` JSON object with its contents. If the file does not exist or an error occurs, it initializes an empty JSON object.
4. **addToShortTerm() and addToLongTerm() Methods**: These methods allow adding data to `shortTerm` and `longTerm`.
5. **getFromShortTerm() and getFromLongTerm() Methods**: Retrieve values from `shortTerm` and `longTerm`.
6. **saveLongTermStore() Method**: Writes the current state of the `longTerm` JSON object back to the file.
7. **Main Method**: Demonstrates usage with a simple test case.

### Notes:
- Ensure that the JSON library (e.g., org.json) is included in your project dependencies.
- The `long_term_store.json` file should be writable by the application, or you may need to handle file permissions accordingly.
- Error handling and logging are minimal for simplicity. In a production environment, consider adding more robust error handling and detailed logging.
```

---

## 🧠 Phase 4: Generated Reflection
```text
Applied 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store': Added resetAll() method to MemoryManager in src/memory/index.ts
```

---

## 🏆 Ollama Model Candidate Ranking (`REAL_OLLAMA_TAGS`)

Production ranking via `rankCandidateModels()` from `src/providers/ollama-local.ts`:

**Available Models**: `hf.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF:Q4_K_M`, `BGE-M3:latest`, `qwen2.5-coder:7b`, `nomic-embed-text:latest`, `mistral-nemo:latest`

**Ranked Candidates (Coding Preferred)**:
1. `qwen2.5-coder:7b` ⭐ (Coding Model Preferred)
2. `hf.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF:Q4_K_M`
3. `BGE-M3:latest`
4. `nomic-embed-text:latest`
5. `mistral-nemo:latest`

---
*Generated by Vitest Benchmark Suite (06-local-llm-patch-coach.bench.ts)*

---

## File: `07-browser-snapshot-diff.md`

# Benchmark Log: 07-browser-snapshot-diff

**Timestamp**: 2026-08-07T13:28:26.971Z

## 🎯 Target Page & Scrape Context
- **Live Scrape Target**: `http://localhost:3000`
- **Scrape Status**: `LIVE_HTTP_SUCCESS`
- **Parsed Nodes Count**: 15 nodes

---

## ⚡ Browser Snapshot & Interstitial Diff Breakdown

| Scenario | Latency | Key Metric | Tokens / Summary |
|---|---|---|---|
| **1. Click -> Expand (+22 nodes)** | 0.88 ms | Added 22 nodes | **8 tokens** ("+22 nodes mounted under "Home".") |
| **2. DOM-Stable Exit** | 0.09 ms | Stable Signal Exit: `true` | Added: 0, Removed: 0 |
| **3. Cloudflare Structural Wipeout** | 0.23 ms | Structural Signal: `true` | **19 tokens** (Blocked: `true`) |
| **4. Live Scrape (localhost:3000)** | — | Status: `LIVE_HTTP_SUCCESS` | Parsed 15 snapshot nodes |

---

## 📄 Scenario 1: Expand Diff Summary
```text
+22 nodes mounted under "Home".
```

---

## 🛡️ Scenario 3: Cloudflare Detection Output
```json
{
  "blocked": true,
  "type": "cloudflare",
  "evidence": "checking your browser before accessing"
}
```

---
*Generated by Vitest Benchmark Suite (07-browser-snapshot-diff.bench.ts)*

---

## File: `08-firebase-retry.md`

# Benchmark Log: 08-firebase-retry

**Timestamp**: 2026-08-06T06:05:30.919Z

## Scenarios Executed

1. **exchangeRefreshToken (0 retries instant success)**
   - Latency: 0.25 ms
   - Attempts: 1
   - Token Count: 37 tokens
   - Result: Auth Success (UID: uid-1)

2. **exchangeRefreshToken (1 retry with backoff)**
   - Latency: 0.09 ms
   - Attempts: 2
   - Token Count: 37 tokens
   - Result: Auth Recovered on Retry (UID: uid-2)

3. **exchangeRefreshToken (3 retries exhausted fallback to new account)**
   - Latency: 0.03 ms
   - Attempts: 3
   - Token Count: 74 tokens
   - Warnings Logged:
     - `[Firebase] Refresh token exchange failed after retries: fetch failed (timeout attempt 3). Falling back to a new anonymous account.`
     - `[Firebase] Saved identity (UID: mock-saved-uid) could not be restored — provisioning a NEW anonymous account. Previous usage history will appear under the old UID.`
   - Fallback Action: Provisioned new anonymous account

---
*Generated by Vitest Benchmark Suite (08-firebase-retry.bench.ts)*

---

## File: `09-vision-tool.md`

# Benchmark Log: 09-vision-tool — Agentic vs. Non-Agentic Pipeline Diff

**Timestamp**: 2026-08-07T10:36:40.962Z

## 🎯 Benchmark Target Image & Prompt
- **Image URI**: `file:///C:/Users/mahes/OneDrive/Desktop/Python-Projects/awesome-free-llm-apis/mcp-server/benchmarks/fixtures/sample.png`
- **User Prompt**: `Analyze this UI diagram for architectural patterns and vision accessibility.`

---

## ⚡ Agentic vs. Non-Agentic Vision Pipeline Comparison

| Pipeline Dimension | Non-Agentic Mode (`isOnePass: true`) | Agentic Mode (`isOnePass: false`) | Structural Impact |
|---|---|---|---|
| **Middleware Chain** | 4 Middlewares (`StructuralMarkdown → ResponseCache → WorkspaceContext → ImageRouter`) | 5 Middlewares (`StructuralMarkdown → ResponseCache → WorkspaceContext → AgenticMiddleware → ImageRouter`) | Subtask decomposition added |
| **Execution Strategy** | Single-pass direct vision LLM response | Multi-pass goal graph & subtask iteration | High-complexity image analysis |
| **Pipeline Status** | `[NO_VISION_KEY_FALLBACK] No available providers for vision routing.` | `[NO_VISION_KEY_FALLBACK] No available providers for vision routing.` | Fallback resilience verified |
| **Output Token Size** | **59 tokens** | **35 tokens** | Detailed subtask trace |

---

## 📄 Non-Agentic Output Sample (59 tokens)
```markdown
[NON_AGENTIC_RESPONSE] Analyzed 1x1 image fixture at file:///C:/Users/mahes/OneDrive/Desktop/Python-Projects/awesome-free-llm-apis/mcp-server/benchmarks/fixtures/sample.png. Image router identified standard 1-pass visual layout.
```

---

## 📄 Agentic Output Sample (35 tokens)
```markdown
[AGENTIC_RESPONSE] Analyzed image fixture via multi-pass AgenticMiddleware decomposition. Subtask 1: Image element segmentation. Subtask 2: Accessibility contrast verification.
```

---
*Generated by Vitest Benchmark Suite (09-vision-tool.bench.ts)*

---

## File: `10-execute-skill.md`

# Benchmark Log: 10-execute-skill — Source Detection & Hermes Adapter Overhead

**Timestamp**: 2026-08-07T10:37:31.653Z

## 🎯 Benchmark Target Skill & Prompt Context
- **Target Skill**: `code-refactor`
- **Source Auto-Detect**: `findHermesSkill('code-refactor')` -> `agentic-awesome-fallback`

---

## ⚡ Skill Routing & Adapter Overhead Breakdown

| Dimension | Measured Value | Description |
|---|---|---|
| **Hermes Manifest Lookup** | **0.12 ms** | Auto-detection search across bundled Hermes skill manifest |
| **Hermes Adapter Note** | **101 tokens** | Tool surface overrides injected ahead of Hermes `SKILL.md` |
| **Base SKILL.md Content** | **73 tokens** | Raw skill instructions |
| **Total Injected System Prompt** | **174 tokens** | Adapter Note + Base SKILL.md content |
| **Extracted File References** | **3 files** | `references/functional-patterns.md`, `examples/refactor-demo.ts`, `references/error-handling.md` |

---

## 📄 Injected Hermes Adapter Note (101 tokens)
```markdown
## MCP Environment Overrides
This skill originates from the Hermes-Agent skill set, authored for a different environment. In THIS environment:
- Do NOT create files or folders directly. Use `manage_memory` for persistent storage instead.
- For fetching external/web data, use `browser_tool`.
- For searching existing code or prior notes, use the workspace context tools (grep/wiki) already available to you — not a raw filesystem search.
Follow the skill's methodology below, but execute it through this server's tools.
```

---

## 📄 Extracted Referenced Files (3 files)
```json
[
  "references/functional-patterns.md",
  "examples/refactor-demo.ts",
  "references/error-handling.md"
]
```

---
*Generated by Vitest Benchmark Suite (10-execute-skill.bench.ts)*

---

## File: `11-wiki-mechanisms.md`

# Benchmark Log: 11-wiki-mechanisms — GlobalWikiManager, CTF Graph & ADR Validation

**Timestamp**: 2026-08-07T13:26:27.450Z

## 🎯 Target Wiki Namespace & Target Query
- **Namespace**: `cyber-tools-bench`
- **Query**: `SQL Injection` -> Found **1 pages**

---

## ⚡ Wiki Mechanisms & CTF Graph Breakdown

| Component | Operation | Result / Payload Size | Status |
|---|---|---|---|
| **GlobalWikiManager** | `GlobalWikiManager.flushToWiki(wiki)` | Persisted Tool Reliability statistics page | ✅ FLUSHED |
| **Wiki Storage** | `wiki.write()`, `wiki.search()` | Ingested `ctf-notes/sqli-bypass` (71 tok) | ✅ SUCCESS |
| **CTF Task Graph** | Node Serialization & Column Grouping | 15 nodes grouped into 4 CTF types | **592 tokens** |
| **ADR Validator** | `parseAndValidateDecisions()` | Validated 2 architectural decision records | ✅ VALIDATED |

---

## 📄 CTF Task Graph Grouped Columns
```json
{
  "concept": [
    "task_0: CTF Task 0: Evaluate vulnerability hypothesis 0",
    "task_4: CTF Task 4: Evaluate vulnerability hypothesis 4",
    "task_8: CTF Task 8: Evaluate vulnerability hypothesis 8",
    "task_12: CTF Task 12: Evaluate vulnerability hypothesis 12"
  ],
  "code": [
    "task_1: CTF Task 1: Evaluate vulnerability hypothesis 1",
    "task_5: CTF Task 5: Evaluate vulnerability hypothesis 5",
    "task_9: CTF Task 9: Evaluate vulnerability hypothesis 9",
    "task_13: CTF Task 13: Evaluate vulnerability hypothesis 13"
  ],
  "doc": [
    "task_2: CTF Task 2: Evaluate vulnerability hypothesis 2",
    "task_6: CTF Task 6: Evaluate vulnerability hypothesis 6",
    "task_10: CTF Task 10: Evaluate vulnerability hypothesis 10",
    "task_14: CTF Task 14: Evaluate vulnerability hypothesis 14"
  ],
  "external": [
    "task_3: CTF Task 3: Evaluate vulnerability hypothesis 3",
    "task_7: CTF Task 7: Evaluate vulnerability hypothesis 7",
    "task_11: CTF Task 11: Evaluate vulnerability hypothesis 11"
  ]
}
```

---

## 📄 Validated ADR Decisions (2 items)
```json
[
  {
    "title": "ADR-001: Adopt WorkspaceContextMiddleware",
    "content": "Adopted 4-layer memory context isolation gate.",
    "tags": [
      "adr",
      "architecture"
    ],
    "links": [
      "Architecture Overview"
    ]
  },
  {
    "title": "ADR-002: Hermes Skill Adapter Note",
    "content": "Inject Hermes environment override note ahead of SKILL.md content.",
    "tags": [
      "adr",
      "hermes"
    ],
    "links": [
      "Skill Engine"
    ]
  }
]
```

---
*Generated by Vitest Benchmark Suite (11-wiki-mechanisms.bench.ts)*

---

## File: `12-pdf-indexing.md`

# Benchmark Log: 12-pdf-indexing — STTP PDF Chunking, RAG Retrieval & Wiki Creation

**Timestamp**: 2026-08-07T13:28:02.631Z

## 🎯 Target PDF File & Query Context
- **Source Document**: `docs/architecture.pdf`
- **Raw Document Size**: 722 characters (129 tokens)
- **RAG Target Query**: `memory layers security isolation gate`

---

## ⚡ PDF Indexing Pipeline Breakdown

| Pipeline Stage | Operation / Utility | Output / Result | Status |
|---|---|---|---|
| **1. Text Chunking** | `chunkText(text, 200, 30)` | Produced 5 text chunks | ✅ COMPLETED |
| **2. Vector Embedding** | `vectorStore.upsert()` | Embedded 5 chunks into vector index | ✅ INDEXED |
| **3. RAG Retrieval** | `vectorStore.search(k=2)` | Retrieved **2 relevant chunks** | ✅ RETRIEVED |
| **4. Wiki Memory Note** | `wiki.write('pdf-wiki/architecture-pdf')` | Created durable markdown summary note | ✅ PERSISTED |

---

## 📄 Top RAG Retrieved Chunk (42 tokens)
```markdown
he server orchestrates 4 distinct memory layers: ShortTermMemory, LongTermMemory, WikiMemory, and VectorStore.

2. Security & Verification
Security controls are enforced via the Isolation Gate Protoco
```

---

## 📄 Generated PDF Wiki Summary Note (67 tokens)
```markdown
# PDF Architecture Report Summary

- Extracted 5 chunks from `docs/architecture.pdf`.
- Top RAG Match: he server orchestrates 4 distinct memory layers: ShortTermMemory, LongTermMemory, WikiMemory, and VectorStore.

2. Security & Verification
Security controls are enforced via the Isolation Gate Protoco
```

---
*Generated by Vitest Benchmark Suite (12-pdf-indexing.bench.ts)*

---

