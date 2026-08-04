import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { useFreeLLM } from '../tools/use-free-llm.js';
import { visionTool } from '../tools/vision-tool.js';
import { loadSkillPrompt } from '../tools/load-skill-prompt.js';
import { executeSkill } from '../tools/execute-skill.js';
// v1.0.5 Deprecated: Unnecessary feature (Remove this comment and import in new update)
//import { listAvailableFreeModels } from '../tools/list-models.js';
// v1.0.5 Deprecated: Unnecessary feature (DO NOT REMOVE THE CODE COMMENT)
//import { runCodeMode } from '../tools/code-mode.js';
import { manageMemory } from '../tools/manage-memory.js';
import { getTokenStats } from '../tools/get-token-stats.js';
import { validateProvider } from '../tools/validate-provider.js';
import { indexWorkspace } from '../tools/index-workspace.js';
import { toMarkdownResponse } from '../utils/markdown.js';
import { logToolCall } from '../utils/ChatLogger.js';
import { WorkspaceScanner } from '../cache/workspace.js';
import { actionEnum, renderActionDocs } from '../browser/actionSchemas.js';
import { dispatchBrowserAction } from '../browser/dispatch.js';
import { getBrowserSessionPool } from '../browser/BrowserSessionPool.js';

/** Derive a stable ws-<hash> session ID from tool args, falling back to __no_ws__. */
async function deriveSessionIdFromArgs(args: Record<string, any> | null | undefined): Promise<string> {
  const ws: string = (args?.workspace_root || args?.workspaceDir || '').toString().trim();
  if (!ws) return '__no_ws__';
  try {
    const hash = await new WorkspaceScanner(process.cwd()).getWorkspaceHash(ws);
    return `ws-${hash.substring(0, 16)}`;
  } catch {
    return '__no_ws__';
  }
}

export async function createMCPServer(): Promise<Server> {
  const server = new Server(
    { name: 'free-llm-apis', version: '1.0.8' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'use_free_llm',
        description: [
          'Universal chat interface for all free LLM providers with automatic failover.',
          '',
          'USER STORY: Send a prompt to any free LLM model. If the chosen model or provider is',
          'unavailable (rate-limited, missing key, network error), the pipeline automatically',
          'falls back through a prioritized list of free models until one succeeds.',
          '',
          'WHEN TO USE: For any natural-language task — summarization, code review, Q&A, translation.',
          'Use explicit keywords to help the router choose the best model and documentation.',
          '',
          '⚠️  PROJECT WORK RULE: When performing ANY task scoped to a project or workspace, you MUST',
          '  include BOTH `workspace_root` (absolute path) AND `agentic: true`. Omitting these fields',
          '  disables all memory injection, context enrichment, and session persistence — the response',
          '  will be blind to all prior work. A bare call with only `messages` is for one-off queries only.',
          '',
          'INPUTS:',
          '  messages (required)           — Array of {role, content}. Roles: "system" | "user" | "assistant".',
          '  model (optional)              — Specific model ID. If omitted, the router picks the best for the task.',
          '  keywords (optional)           — Explicit steering tags (e.g. ["api", "sql"]) to prioritize reference map injection.',
          '  agentic (optional)            — Enable agentic mode (task decomposition + memory injection).',
          '                                  Set to true for all project-scoped requests.',
          '  sessionId (optional)          — Unique session slug (e.g. UUID or "my-project"). Partitions state/logs.',
          '                                  Auto-derived from workspace_root if omitted.',
          '  workspace_root (recommended)  — Absolute path to the project root.',
          '                                  Required to enable memory enrichment, context retrieval,',
          '                                  and workspace-scoped recall. Always provide for project tasks.',
          '  google_search (optional)      — Enable Google search for Gemini models (default false).',
          '',
          'OUTPUTS: Assistant response text enriched with workspace memory when agentic=true + workspace_root.',
          '         Multiple choices are labeled AGENT RESPONSE 1, AGENT RESPONSE 2, etc.',
          '         Metadata (model, usage, id) is stripped to keep context lean.',
          '',
          'FAILURE STATES:',
          '  - "No providers available": all fallback models exhausted. Check `get_token_stats`.',
          '  - "Rate limited": provider quota exceeded. Use another model or try later.',
          '  - Context-blind response: missing workspace_root or agentic — memory pipeline was bypassed.',
          '',
          'EXAMPLE (project task — correct):',
          '  { "messages": [...], "agentic": true, "workspace_root": "/abs/path/to/project", "keywords": ["python"] }',
          '',
          'EXAMPLE (one-off query — no memory needed):',
          '  { "messages": [{ "role": "user", "content": "What is a monoid?" }] }',
        ].join('\n'),
        inputSchema: {
          type: 'object' as const,
          properties: {
            messages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                  content: { type: 'string' },
                },
                required: ['role', 'content'],
              },
              description: 'Conversation messages. Always include at least one user message.',
            },
            model: { type: 'string', description: 'Specific model request. If omitted, the router picks the best model for the task.' },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Explicit steering tags to prioritize/filter documentation sections from reference maps.'
            },
            agentic: { type: 'boolean', description: 'Enable agentic mode: task decomposition and intelligent system prompt injection' },
            sessionId: { type: 'string', description: 'Unique session identifier required for agentic mode (e.g. UUID or project slug). Partitions state and logs per project.' },
            workspace_root: { type: 'string', description: 'Workspace path for cache-keying and auto-sessionId derivation' },
            google_search: { type: 'boolean', description: 'Enable Google search for Gemini models (default false)' },
            skill: { type: 'string', description: 'Optional skill id/name loaded dynamically from remote skill index' },
            skipIndexing: {
              type: 'boolean',
              description: 'Skip the pre-emptive full-workspace re-index + wiki-maintenance pass that agentic mode normally runs on every call with workspace_root. Set true for requests narrowly about a specific file/PDF reference that don\'t need (or shouldn\'t pay the latency/provider-budget cost of) a full codebase re-scan — otherwise that unrelated indexing work can starve the actual request of provider quota.'
            },
          },
          required: ['messages'],
        },
      },
      {
        name: 'vision_tool',
        description: 'Analyze a local image using a vision-capable model via use_free_llm.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            workspace_root: { type: 'string', description: 'Absolute workspace path' },
            image_path: { type: 'string', description: 'Image URI using file:/// scheme' },
            prompt: { type: 'string', description: 'Optional analysis prompt' },
            model: { type: 'string', description: 'Optional vision model id' },
          },
          required: ['workspace_root', 'image_path'],
        },
      },
       {
         name: 'load_skill_prompt',
         description: 'Search for or load a dynamic skill from the agentic-awesome-skills index. Skills are saved locally to the workspace or home directory.',
         inputSchema: {
           type: 'object' as const,
           properties: {
             type: { type: 'string', enum: ['load', 'search'], description: 'Whether to load a specific skill or search for matching skills.' },
             name: { type: 'string', description: 'The name or ID of the skill to load (required if type is "load").' },
             keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords to search for skills (required if type is "search").' },
             workspaceDir: { type: 'string', description: 'Optional absolute path to a workspace directory for local storage. Defaults to user home directory.' },
           },
           required: ['type'],
         },
       },
      // Deprecated (To be removed in future)
      // {
      //   name: 'list_available_free_models',
      //   description: [
      //     'Enumerate all registered LLM providers and models with rate-limit metadata.',
      //     '',
      //     'USER STORY: Discover which free models and providers are configured and available',
      //     'before sending a request. Use this to select the best model for a task or to check',
      //     'which providers have API keys set.',
      //     '',
      //     'WHEN TO USE: Before calling `use_free_llm` when you want to choose a specific model,',
      //     'or to audit which providers are active in the current environment.',
      //     '',
      //     'INPUTS:',
      //     '  provider (optional)      — Filter results to a single provider ID (e.g. "groq").',
      //     '  available_only (optional)— If true, only return models whose provider has an API key set.',
      //     '',
      //     'OUTPUTS: { models: [{providerId, modelId, modelName, rateLimits, available}], summary }',
      //     '  Each model entry includes rate limits (rpm, rpd, tpm) and availability flag.',
      //     '',
      //     'FAILURE STATES:',
      //     '  - Empty models array: no providers registered or all filtered out.',
      //     '  - available:false entries: provider is registered but API key is not set in environment.',
      //     '',
      //     'EXAMPLE:',
      //     '  { available_only: true }  → lists only models with configured API keys',
      //     '  { provider: "groq" }      → lists all Groq models with rate-limit metadata',
      //   ].join('\n'),
      //   inputSchema: {
      //     type: 'object' as const,
      //     properties: {
      //       provider: { type: 'string', description: 'Filter by provider ID (e.g. "groq", "gemini", "openrouter")' },
      //       available_only: { type: 'boolean', description: 'If true, only return models whose provider API key is configured' },
      //     },
      //   },
      // },
      {
        name: 'get_token_stats',
        description: [
          'Retrieve real-time token and request usage statistics for all loaded providers.',
          '',
          'USER STORY: Monitor per-provider consumption to avoid hitting rate limits. Identify',
          'which providers have remaining quota before selecting a model for the next request.',
          '',
          'WHEN TO USE: Before a batch of requests to baseline quota; after requests to audit',
          'consumption; when a provider returns rate-limit errors.',
          '',
          'INPUTS: None (no parameters required)',
          '',
          'OUTPUTS: Array of provider stat objects:',
          '  [{ id, name, isAvailable, rateLimits:{rpm,rpd,tpm}, usage:{tokens,requests} }]',
          '  Counters reset on server restart. Use isAvailable to skip providers with no API key.',
          '',
          'FAILURE STATES:',
          '  - Empty array: no providers registered (check server configuration).',
          '  - usage.tokens/requests = 0 on fresh start; increments after each `use_free_llm` call.',
          '',
          'EXAMPLE RESPONSE (Groq):',
          '  { id:"groq", name:"Groq", isAvailable:true, rateLimits:{rpm:30,rpd:14400},',
          '    usage:{tokens:1024, requests:2} }',
        ].join('\n'),
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'validate_provider',
        description: [
          'Run a live health-check and credential validation for a specific LLM provider.',
          '',
          'USER STORY: Verify that a provider is reachable and its API key is valid before',
          'committing to it for a workflow. Use this for onboarding new providers or debugging',
          'authentication failures.',
          '',
          'WHEN TO USE: During environment setup; when `use_free_llm` returns auth errors;',
          'before automated workflows that depend on a specific provider.',
          '',
          'INPUTS:',
          '  providerId (required) — Provider ID to validate (e.g. "groq", "gemini", "openrouter").',
          // '                          Use `list_available_free_models` to get valid provider IDs.',
          '',
          'OUTPUTS: { providerId, status:"healthy"|"degraded"|"unavailable", latencyMs,',
          '           credentialsValid, message }',
          '',
          'FAILURE STATES:',
          '  - status:"unavailable": API key missing or network unreachable.',
          '  - status:"degraded": key valid but provider returning errors (rate limit, model unavailable).',
          '  - Unknown providerId: throws error listing known provider IDs.',
          '',
          'EXAMPLE:',
          '  { providerId: "groq" }  → validates Groq API key and connectivity',
        ].join('\n'),
        inputSchema: {
          type: 'object' as const,
          properties: {
            providerId: { type: 'string', description: 'Provider ID to validate (e.g. "groq", "gemini", "openrouter", "cohere")' },
          },
          required: ['providerId'],
        },
      },
      // v1.0.5 Deprecated: Unnecessary feature (DO NOT REMOVE THE CODE COMMENT)
      // {
      //   name: 'code_mode',
      //   description: [
      //     'Execute code in a sandboxed runtime against input data. Only stdout enters context.',
      //     '',
      //     'USER STORY: Process large API responses or datasets with a script without flooding',
      //     'the LLM context window. Write a filtering/transformation script; only its printed',
      //     'output (stdout) is returned — not the raw DATA payload.',
      //     '',
      //     'WHEN TO USE: When an API response is too large to pass directly to an LLM. Write a',
      //     'script to extract only the relevant fields, then pass the compressed output to',
      //     '`use_free_llm`. Also use for sandboxed computation, data transformation, or testing',
      //     'code snippets in isolation.',
      //     '',
      //     'INPUTS:',
      //     '  code (required)   — Script source. Use print() or console.log() to emit output.',
      //     '                      DATA global contains the input string (from `data` param).',
      //     '  language          — Sandbox runtime (default: "javascript"):',
      //     '                      "javascript" — QuickJS (quickjs-emscripten), in-process',
      //     '                      "python"     — RestrictedPython subprocess; requires python3 + pip install RestrictedPython',
      //     '                      "go"         — goja (pure-Go ECMAScript); requires pre-built binary',
      //     '                                     Build: cd scripts/go-sandbox-runner && go build -o sandbox-runner .',
      //     '                      "rust"       — boa_engine (pure-Rust ECMAScript); requires pre-built binary',
      //     '                                     Build: cd scripts/rust-sandbox-runner && cargo build --release',
      //     '  data              — Raw input string injected as DATA global variable.',
      //     '  command           — Human-readable description of what the script does (for logging).',
      //     '  timeout_ms        — Max execution time in milliseconds (default 5000).',
      //     '',
      //     'OUTPUTS: { stdout, stderr, success, error?, executionTimeMs, compressionRatio? }',
      //     '  compressionRatio = stdout.length / data.length (< 1 = context savings achieved).',
      //     '',
      //     'SANDBOX CONSTRAINTS (all languages):',
      //     '  - No filesystem access (read or write)',
      //     '  - No network access',
      //     '  - No process/OS calls',
      //     '  - Execution time limited by timeout_ms',
      //     '',
      //     'FAILURE STATES:',
      //     '  - success:false + error:"Execution timed out": increase timeout_ms or simplify script.',
      //     '  - success:false + error message: syntax or runtime error in script; check stderr.',
      //     '  - Empty stdout: script ran but called no print()/console.log().',
      //     '  - Binary not found (go/rust): build the runner first per instructions above.',
      //     '',
      //     'JAVASCRIPT EXAMPLE:',
      //     '  code: "const items = JSON.parse(DATA); print(items.map(i=>i.name).join(\\"\\\\n\\"))"',
      //     '  data: \'[{"name":"Alice"},{"name":"Bob"}]\'',
      //     '  → stdout: "Alice\\nBob"',
      //     '',
      //     'PYTHON EXAMPLE:',
      //     '  language: "python"',
      //     '  code: "import json; items=json.loads(DATA); print(len(items))"',
      //     '  data: \'[1,2,3]\'',
      //   ].join('\n'),
      //   inputSchema: {
      //     type: 'object' as const,
      //     properties: {
      //       code: { type: 'string', description: 'Script source code. Use print() or console.log() to emit output. DATA global contains the input data string.' },
      //       language: {
      //         type: 'string',
      //         enum: ['javascript', 'python', 'go', 'rust'],
      //         description: 'Sandbox runtime language (default: "javascript"). Each runs in an isolated, network-free, filesystem-free environment.',
      //       },
      //       data: { type: 'string', description: 'Input data injected as DATA global variable in the sandbox' },
      //       command: { type: 'string', description: 'Human-readable description of what the script does (used for logging and memory)' },
      //       timeout_ms: { type: 'number', description: 'Execution timeout in milliseconds (default 5000). Increase for heavy computations.' },
      //     },
      //     required: ['code'],
      //   },
      // },
      {
        name: 'manage_memory',
        description: [
          'Workspace-aware persistent memory operations: search, list, stats, and clear.',
          '',
          'USER STORY: Retrieve or manage past interactions and compression statistics scoped',
          'to a specific workspace. Use before wide-context actions to recall relevant prior',
          'work, or after processing to inspect memory usage.',
          '',
          'WHEN TO USE:',
          '  - BEFORE large refactoring or research: search memory for prior context.',
          '  - AFTER processing: check stats for token/compression savings.',
          '  - FOR CLEANUP: clear workspace memory when starting fresh.',
          '',
          'INPUTS:',
          '  action (required)        — One of: "search" | "list" | "stats" | "clear".',
          '  workspace_root (optional)— Absolute path to workspace root. Used to scope memory.',
          '  query (optional)         — Search term for "search" action (semantic/substring match).',
          '  limit (optional)         — Max results for "search" action (default 10).',
          '',
          'ACTION DETAILS:',
          '  search → Returns memory entries matching query for the workspace.',
          '           Input: { action:"search", workspace_root:"/src/app", query:"authentication" }',
          '  list   → Returns workspace identifier and hash for the given root.',
          '           Input: { action:"list", workspace_root:"/src/app" }',
          '  stats  → Returns aggregate compression stats (bytes saved, ratio) across all operations.',
          '           Input: { action:"stats" }',
          '  clear  → Marks workspace memory namespace for clearing.',
          '           Input: { action:"clear", workspace_root:"/src/app" }',
          '',
          'OUTPUTS:',
          '  search → Array of memory entries with metadata.',
          '  list   → { workspace, hash }',
          '  stats  → { totalOriginalBytes, totalCompressedBytes, overallRatio, operationCount }',
          '  clear  → { success:true, message }',
          '',
          'FAILURE STATES:',
          '  - "Unsupported action": only search/list/stats/clear are valid.',
          '  - Empty search results: no prior memory for this workspace or query has no matches.',
          '',
          'AGENT REMINDER: Always invoke manage_memory before wide-context actions to retrieve',
          'relevant prior work and avoid redundant processing.',
        ].join('\n'),
        inputSchema: {
          type: 'object' as const,
          properties: {
            action: {
              type: 'string',
              enum: ['search', 'list', 'stats', 'clear'],
              description: 'Memory operation: "search" (find entries), "list" (workspace info), "stats" (usage metrics), "clear" (reset workspace)',
            },
            workspace_root: { type: 'string', description: 'Absolute path to workspace root for scoping memory operations (e.g. "/home/user/my-project")' },
            query: { type: 'string', description: 'Search term for "search" action — used for semantic or substring retrieval of prior context' },
            limit: { type: 'number', description: 'Maximum number of results to return for "search" action (default 10)' },
          },
          required: ['action'],
        },
      },
      {
        name: 'store_workspace_skill',
        description: [
          'Explicitly harvest structured knowledge and scripts into the workspace.',
          'Use this to persist complex research or multi-step implementations as a reusable skill.',
          '',
          'FOLLOWS @skill-writer schema:',
          '- name: lowercase-hyphenated name of the skill',
          '- description: one-sentence description of the skill and when to trigger it',
          '- what: list of key decisions, findings, or implementation details',
          '- why: supporting rationale or background context',
          '- files: files modified or referenced',
          '- example: code snippet or example usage',
          '- scripts: map of script filename to code content',
          '- workspace_root: absolute path to the workspace root'
        ].join('\n'),
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Lowercase-hyphenated name of the skill' },
            description: { type: 'string', description: 'One-sentence description of the skill and when to trigger it' },
            what: { type: 'array', items: { type: 'string' }, description: 'List of key decisions, findings, or implementation details' },
            why: { type: 'string', description: 'Supporting rationale or background context' },
            files: { type: 'array', items: { type: 'string' }, description: 'Files modified or referenced' },
            example: { type: 'string', description: 'Code snippet or example usage' },
            script_instructions: { type: 'object', additionalProperties: { type: 'string' }, description: 'Map of script filename to an instruction detailing what the script should do. The server will use an internal LLM to intelligently generate the script code.' },
            workspace_root: { type: 'string', description: 'Absolute path to the workspace root' },
          },
          required: ['name', 'description', 'what', 'workspace_root'],
        },
      },
      {
        name: 'index_workspace',
        description: [
          'Proactively index all relevant files in the workspace into the persistent vector database.',
          '',
          'USER STORY: Update the semantic memory of the project so that future queries can find',
          'relevant code snippets even if you haven\'t manually stored them yet.',
          '',
          'WHEN TO USE: After significant code changes, when starting a new session, or when',
          'semantic search results seem outdated.',
          '',
          'INPUTS:',
          '  workspace_root — Absolute path to the workspace root to index.',
          '  force          — If true, wipes the existing index and rebuilds from scratch (self-healing).',
          '',
          'OUTPUTS: { totalFiles, indexedFiles, skippedFiles, errors }',
          '',
          'Note: Uses hash-based tracking to only index changed files, making it fast for subsequent runs.',
        ].join('\n'),
        inputSchema: {
          type: 'object' as const,
          properties: {
            workspace_root: { type: 'string', description: 'Absolute path to workspace root (e.g. "/home/user/my-project")' },
            force: { type: 'boolean', description: 'Force rebuild of the index (wipes existing)' },
          },
          required: ['workspace_root'],
        },
      },
      {
        name: 'execute_skill',
        description: 'Execute a prompt using a specific local skill\'s instructions and reference files.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            skill: { type: 'string', description: 'Name of the skill directory under .free-llm-mcp/skills/' },
            input: { type: 'string', description: 'The prompt or instruction to run with the skill.' },
            model: { type: 'string', description: 'Optional model to use.' },
            workspace_root: { type: 'string', description: 'Optional absolute path to the project root.' },
            sessionId: { type: 'string', description: 'Optional session identifier.' }
          },
          required: ['skill', 'input']
        }
      },
      {
        name: 'browser_tool',
        description: `Browser automation & scraper that owns a real chrome-devtools-mcp session. Actions: ${renderActionDocs()}`,
        inputSchema: {
          type: 'object' as const,
          properties: {
            action: { type: 'string', enum: actionEnum(), description: 'Which browser action to perform' },
            url: { type: 'string', description: 'Target website URL (required for navigate/scrape; optional elsewhere)' },
            sessionId: { type: 'string', description: 'Session identifier — reuses a live browser session and checkpoint across calls' },
            outputDir: { type: 'string', description: 'Directory to store output datasets, checkpoints, and network dumps' },
            userInstructions: { type: 'string', description: 'Prompt/instructions for extraction actions' },
            strict: { type: 'boolean', description: 'When true (default), extraction failures return data:null + errors instead of best-effort guesses' },
            params: { type: 'object', description: 'Action-specific parameters (see the action list above)' }
          },
          required: ['action']
        }
      },
      {
        name: 'cyber_tool',
        description: 'Educational cyber security coach plus registry/wiki manager for security binaries (sqlmap, nmap, ffuf). Never executes commands — it teaches the exact commands, explains why, tracks CTF decision graphs, and remembers per-tool run suggestions across sessions so the learner can resume where they left off.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            action: { type: 'string', enum: ['list_tools', 'get_tool', 'register_tool', 'wiki_lookup', 'learn', 'coach', 'save_graph', 'load_graph', 'tool_memory'], description: 'Cyber tool action' },
            toolName: { type: 'string', description: 'Security tool name (e.g. sqlmap, nmap, ffuf)' },
            githubUrl: { type: 'string', description: 'GitHub repository URL for tool registration' },
            sessionId: { type: 'string', description: 'Session/CTF-challenge id; keys the progress record and decision graph for learn/coach/save_graph/load_graph' },
            goal: { type: 'string', description: 'Natural-language objective for the learn action, e.g. "find SQLi on a lab web app"' },
            level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: 'Learner skill level; defaults to beginner' },
            observation: { type: 'string', description: 'For coach: what the learner ran and what they observed' },
            graphNode: {
              type: 'object',
              description: 'For save_graph: a decision-graph node to add, optionally linked from a prior node',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                type: { type: 'string', enum: ['goal', 'hypothesis', 'action', 'finding', 'deadend'] },
                from: { type: 'string', description: 'id of the node this one follows from' }
              }
            },
            memoryOp: { type: 'string', enum: ['read', 'write'], description: 'For tool_memory: read or append to that tool\'s run-suggestion memory' },
            note: { type: 'string', description: 'For tool_memory write: the run suggestion/note to append' }
          },
          required: ['action']
        }
      }
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    const _start = Date.now();

    let response: { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

    try {
      if (name === 'use_free_llm' || name === 'free_llm_api') {
        const input = args as unknown as Parameters<typeof useFreeLLM>[0];
        const result = await useFreeLLM(input);

        // Extract only the assistant content — strip headers, usage, id, etc.
        // Handles multiple choices (e.g. n>1 or beam-search providers) by joining.
        const choices: Array<{ message?: { content?: string }; text?: string }> =
          Array.isArray(result?.choices) ? result.choices : [];

        const texts = choices
          .map((c) => (c?.message?.content ?? c?.text ?? '').trim())
          .filter(Boolean);

        const responseText = texts.length === 0
          ? JSON.stringify(result, null, 2) // fallback: no choices at all
          : texts.length === 1
            ? texts[0]  // single response — return as-is, no label overhead
            : texts.map((t, i) => `AGENT RESPONSE ${i + 1}\n\n${t}`).join('\n\n');

        response = {
          content: [{ type: 'text' as const, text: toMarkdownResponse(responseText) }],
        };
      } else if (name === 'vision_tool') {
        const result = await visionTool(args as any);
        response = {
          content: [{ type: 'text' as const, text: toMarkdownResponse(result.response) }],
        };
      } else if (name === 'load_skill_prompt') {
        const result = await loadSkillPrompt(args as any);
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } else if (name === 'manage_memory') {
        const input = args as unknown as Parameters<typeof manageMemory>[0];
        const result = await manageMemory(input);
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } else if (name === 'store_workspace_skill') {
        const { storeWorkspaceSkill } = await import('../tools/store-workspace-skill.js');
        const input = args as any;
        const result = await storeWorkspaceSkill(input);
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } else if (name === 'get_token_stats') {
        const result = await getTokenStats();
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } else if (name === 'validate_provider') {
        const { providerId } = args as { providerId: string };
        const result = await validateProvider(providerId);
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } else if (name === 'index_workspace') {
        const input = args as any;
        const result = await indexWorkspace(input);
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } else if (name === 'execute_skill') {
        const input = args as any;
        const result = await executeSkill(input);
        response = {
          content: [{ type: 'text' as const, text: result.success ? result.response ?? '' : `Error: ${result.error}` }]
        };
      } else if (name === 'browser_tool') {
        const result = await dispatchBrowserAction(args);
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        };
      } else if (name === 'cyber_tool') {
        const { cyberTool } = await import('../tools/cyber-tool.js');
        const result = await cyberTool(args as any);
        response = {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
        };
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      response = {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }

    // Fire-and-forget logging — never delays the MCP response
    deriveSessionIdFromArgs(args as any).then(sessionId =>
      logToolCall(sessionId, name, args, response, Date.now() - _start, !!response.isError)
        .catch(() => {})
    ).catch(() => {});

    return response;
  });

  return server;
}
