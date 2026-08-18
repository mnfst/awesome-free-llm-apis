#!/usr/bin/env node

/**
 * --- MCP Stdout Shield (Nuclear Hardening) ---
 * Any stray stdout will corrupt the JSON-RPC stream used by MCP.
 * We intercept all direct writes to stdout and redirect none-JSON content to stderr.
 */
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (chunk: any, encoding: any, callback: any) => {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  // Valid JSON-RPC packets always start with '{'
  if (str.trim().startsWith('{')) {
    return originalStdoutWrite(chunk, encoding, callback);
  }
  // Redirect everything else (logs, ReferenceErrors, etc.) to stderr
  return process.stderr.write(chunk, encoding, callback);
};

// --- Global Safety Handlers (Immediate Preamble) ---
process.on('uncaughtException', (err) => {
  console.error(`[CRITICAL] Uncaught Exception: ${err.message}`);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[CRITICAL] Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Safe fallback if ran on older unsupported Node engines
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { LRUCache } from 'lru-cache';
import { createMCPServer } from './mcp/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'crypto';
import os from 'os';
import { getTokenStats } from './tools/get-token-stats.js';
import { listAvailableFreeModels } from './tools/list-models.js';
import { validateProvider } from './tools/validate-provider.js';
import { flushSystem, useFreeLLM } from './tools/use-free-llm.js';
import { visionTool } from './tools/vision-tool.js';
import { executeSkill } from './tools/execute-skill.js';
import { manageMemory } from './tools/manage-memory.js';
import { indexWorkspace } from './tools/index-workspace.js';
import { cyberTool } from './tools/cyber-tool.js';
import { getSharedRouter } from './pipeline/instances.js';
import { execSync } from 'child_process';
import fs, { promises as fsp } from 'fs';
import { persistence } from './utils/PersistenceManager.js';
import { initFirebase, syncStats, getLeaderboard, getUserStats, getRecentSearchLogs } from './utils/firebase.js';
import { SearchProviderRegistry } from './search/registry.js';
import { withFileLock } from './utils/file-lock.js';
import { writeFileAtomic } from './utils/FileUtils.js';
import { WorkspaceScanner } from './cache/workspace.js';
import { STATE_FILE } from './pipeline/middlewares/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validate system dependencies for code execution sandboxes
 */
async function validateSandboxDependencies() {
  console.error('[Startup] Validating sandbox dependencies...');

  // 1. Python Validation
  let pythonPath: string | null = null;
  const projectRoot = path.resolve(__dirname, '..');
  const isWin = process.platform === 'win32';
  
  const venvPaths = [
    path.join(projectRoot, '.venv', isWin ? 'Scripts/python.exe' : 'bin/python3'),
    path.join(projectRoot, 'venv', isWin ? 'Scripts/python.exe' : 'bin/python3'),
    path.join(projectRoot, '.venv', isWin ? 'Scripts/python' : 'bin/python3'),
    path.join(projectRoot, 'venv', isWin ? 'Scripts/python' : 'bin/python3'),
    path.join(projectRoot, '.venv', isWin ? 'python.exe' : 'bin/python3'),
    path.join(projectRoot, 'venv', isWin ? 'python.exe' : 'bin/python3'),
  ];
  
  for (const vp of venvPaths) {
    if (fs.existsSync(vp)) {
      pythonPath = vp;
      break;
    }
  }
  
  const pythonCommands = isWin 
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  if (!pythonPath) {
    for (const cmd of pythonCommands) {
      try {
        execSync(`${cmd} --version`, { stdio: 'ignore' });
        pythonPath = cmd;
        break;
      } catch {
        // Continue to next
      }
    }
  }

}

async function initTelemetry(force = false) {
  try {
    const state = await persistence.load();
    if (force) {
      state.lastAuthFailedTime = undefined;
      state.lastSyncFailedTime = undefined;
      await persistence.save(state);
    }
    
    // Ensure userId is established (authenticate anonymously) and aligned with the active Firebase session
    const uid = await initFirebase();
    if (state.userId !== uid) {
      state.userId = uid;
      state.username = state.username || `anonymous-${uid.substring(0, 6)}`;
      await persistence.save(state);
    }
    
    // Check if session has expired or is not set
    const now = Date.now();
    if (!state.sessionToken || !state.sessionExpiresAt || now >= state.sessionExpiresAt) {
      state.sessionToken = crypto.randomBytes(32).toString('hex');
      state.sessionExpiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
      await persistence.save(state);
    }
    
    // Sync if more than 24 hours have passed since lastSyncTime, and at least 1 hour since last failure
    const hoursSinceSync = (now - (state.lastSyncTime || 0)) / (1000 * 60 * 60);
    const msSinceFailure = now - (state.lastSyncFailedTime || 0);
    if (hoursSinceSync >= 24 && msSinceFailure >= 60 * 60 * 1000 && !state.optOutTelemetry) {
      const success = await syncStats(state.userId, state);
      if (success) {
        state.lastSyncTime = now;
        state.lastSyncFailedTime = undefined;
        await persistence.save(state);
      } else {
        // Explicitly record failure time to trigger a 1-hour retry backoff
        state.lastSyncFailedTime = now;
        await persistence.save(state);
      }
    }
  } catch (err) {
    console.error('[Telemetry] Failed to initialize telemetry:', err);
  }
}



async function main() {
  try {
    await validateSandboxDependencies();
    
    // Initialize persistent tracking
    await getSharedRouter().init();
    
    // Initialize telemetry / session manager
    await initTelemetry(true);

    // Periodically check/sync telemetry every hour (supports continuous server runs)
    const telemetryInterval = setInterval(async () => {
      try {
        await initTelemetry();
      } catch (err) {
        // Silent warning
      }
    }, 60 * 60 * 1000);
    if (typeof telemetryInterval.unref === 'function') {
      telemetryInterval.unref();
    }
    
    const isSse = process.argv.includes('--sse');
    if (isSse) {
      const app = express();
      const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

      app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
            "style-src": ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "'unsafe-inline'"],
            "font-src": ["'self'", "https://fonts.gstatic.com"],
            "img-src": ["'self'", "data:", "https:*"],
            "connect-src": ["'self'", "https://cdn.jsdelivr.net"],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      }));
      app.use(cors());
      app.use(express.json());

      // API endpoints for dashboard

      // Long-term session-less rate limiting using TTL cache to prevent memory leaks
      const rateLimitCache = new LRUCache<string, { count: number; resetAt: number }>({
        max: 1000,
        ttl: 60_000, // 1 minute
      });
      const RATE_LIMIT_MAX = 120;           // 2 requests/second burst over a minute

      function checkRateLimit(req: express.Request, res: express.Response): boolean {
        const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
          ?? req.socket.remoteAddress
          ?? 'unknown';
        const now = Date.now();
        let entry = rateLimitCache.get(ip);
        if (!entry || now >= entry.resetAt) {
          entry = { count: 0, resetAt: now + 60_000 };
          rateLimitCache.set(ip, entry);
        }
        entry.count++;
        if (entry.count > RATE_LIMIT_MAX) {
          res.status(429).json({ error: 'Too many requests' });
          return false;
        }
        return true;
      }

      app.get('/api/user-config', async (req, res) => {
        try {
          const state = await persistence.load();
          res.json({
            userId: state.userId,
            username: state.username,
            optOutTelemetry: !!state.optOutTelemetry,
            lastSyncTime: state.lastSyncTime
          });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      app.get('/api/prompt_sections', async (req, res) => {
        try {
          const promptPath = path.resolve(__dirname, '../../external/agent-prompt/prompt.json');
          if (fs.existsSync(promptPath)) {
            const raw = await fs.promises.readFile(promptPath, 'utf-8');
            const data = JSON.parse(raw);
            const sections = (data.sections || []).map((sec: any) => ({
              id: sec.id,
              title: sec.title,
              keywords: sec.keywords || [],
              tokenCount: Math.ceil((sec.content || '').length / 4)
            }));
            res.json({ success: true, sections });
          } else {
            res.json({ success: false, error: 'prompt.json not found', sections: [] });
          }
        } catch (err) {
          res.status(500).json({ success: false, error: String(err), sections: [] });
        }
      });

      app.post('/api/user-config', async (req, res) => {
        try {
          const { username, optOutTelemetry } = req.body;
          
          if (username !== undefined) {
            if (typeof username !== 'string' || username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
              res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters, underscores or hyphens' });
              return;
            }
          }
          
          const state = await persistence.load();
          if (username !== undefined) {
            state.username = username;
          }
          if (optOutTelemetry !== undefined) {
            state.optOutTelemetry = !!optOutTelemetry;
          }
          
          await persistence.save(state);
          
          // Sync immediately to Firestore if telemetry is not opted out
          if (state.userId && !state.optOutTelemetry) {
            await syncStats(state.userId, state);
          }
          
          res.json({ success: true, username: state.username, optOutTelemetry: state.optOutTelemetry });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      app.get('/api/leaderboard', async (req, res) => {
        try {
          const state = await persistence.load();
          const list = await getLeaderboard(state.userId);
          
          // Local fallback: ensure the current user is always visible
          if (!list.some((u: any) => u.isCurrentUser)) {
            list.push({
              isCurrentUser: true,
              username: state.username || `anonymous-${state.userId?.substring(0, 6)}`,
              lifetimeTokens: state.lifetimeTotalTokens || 0,
              lifetimeRequests: state.lifetimeTotalRequests || 0,
              lastSyncTime: state.lastSyncTime || Date.now()
            });
            list.sort((a: any, b: any) => b.lifetimeTokens - a.lifetimeTokens);
          }
          
          res.json(list);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      app.get('/api/token-stats', async (req, res) => {
        try {
          const stats: any = await getTokenStats();
          // Per-provider live fields (isAvailable, remainingRequests/Tokens) have no Firebase
          // equivalent and must stay local. But lifetime totals get reset in-memory on a
          // small interval now (LLMExecutor's periodic local-persist-and-reset), so they're
          // no longer reliable to sum from local state for display — overlay the durable
          // Firebase-synced lifetime totals when available, falling back to the local sum
          // (already in `stats`) if offline or not yet synced.
          try {
            const state = await persistence.load();
            if (state.userId) {
              const fbStats = await getUserStats(state.userId);
              if (fbStats) {
                stats.serverTotals = {
                  ...stats.serverTotals,
                  lifetimeRequests: fbStats.lifetimeRequests,
                  lifetimeTokens: fbStats.lifetimeTokens
                };
                stats.lifetimeSource = 'firebase';
                stats.lastSyncTime = fbStats.lastSyncTime;
              }
            }
          } catch {
            // Firebase read unavailable — leave the local-sum serverTotals already in `stats`.
          }
          res.json(stats);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      app.get('/api/provider-stats', async (req, res) => {
        try {
          const stats = getSharedRouter().getExecutor().getProviderStats();
          res.json(stats);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // Search-provider health for the dashboard's Providers tab Search section (v1.0.9).
      app.get('/api/search-provider-stats', async (req, res) => {
        try {
          const providers = SearchProviderRegistry.getInstance().getProviders();
          const stats = providers.map(p => ({
            id: p.id,
            name: p.name,
            available: p.isAvailable(),
            keyless: !p.envVar,
            consecutiveFailures: p.consecutiveFailures,
            penaltyScore: p.getPenaltyScore(),
          }));
          res.json(stats);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // Recent search queries/results logged by SearchRouterMiddleware (v1.0.9).
      app.get('/api/search-logs', async (req, res) => {
        try {
          const logs = await getRecentSearchLogs();
          res.json(logs);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      app.get('/api/list-models', async (req, res) => {
        try {
          const models = await listAvailableFreeModels({});
          res.json(models);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      app.post('/api/validate-provider', async (req, res) => {
        try {
          const { providerId } = req.body;
          const result = await validateProvider(providerId);
          res.json(result);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // Generic tool proxy for the dashboard Tool Playground
      app.post('/api/tool', async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        const { tool, params = {} } = req.body || {};
        if (!tool || typeof tool !== 'string') {
          res.status(400).json({ error: 'Missing tool name' });
          return;
        }
        const start = Date.now();
        try {
          let result: unknown;
          switch (tool) {
            case 'get_token_stats':
              result = await getTokenStats();
              break;
            case 'validate_provider':
              result = await validateProvider(params.providerId);
              break;
            case 'use_free_llm': {
              const messages = Array.isArray(params.messages)
                ? params.messages
                : [{ role: 'user', content: String(params.messages || params.prompt || '') }];
              
              // Resolve sessionId from workspace_root using the same algorithm as the real pipeline
              let sid = params.sessionId;
              if (!sid && params.workspace_root) {
                try {
                  const hash = await new WorkspaceScanner(process.cwd()).getWorkspaceHash(params.workspace_root);
                  sid = `ws-${hash.substring(0, 16)}`;
                } catch {
                  sid = '__no_ws__';
                }
              }

              const r = await useFreeLLM({
                messages,
                model: params.model,
                keywords: params.keywords,
                agentic: !!params.agentic,
                workspace_root: params.workspace_root,
                sessionId: sid || '__no_ws__',
                skipIndexing: !!params.skipIndexing,
                action: params.action,
                resume_input: params.resume_input,
              });
              result = { content: r?.choices?.[0]?.message?.content ?? '', model: r?.model, provider: r?._providerId };
              break;
            }
            case 'vision_tool':
              result = await visionTool({
                image_path: params.image_path,
                prompt: params.prompt,
                model: params.model,
                workspace_root: params.workspace_root || process.cwd(),
              });
              break;
            case 'execute_skill':
              result = await executeSkill({
                skill: params.skill,
                input: params.input,
                model: params.model,
                workspace_root: params.workspace_root,
              });
              break;
            case 'manage_memory':
              result = await manageMemory({
                action: params.action,
                workspace_root: params.workspace_root,
                query: params.query,
                limit: params.limit,
                title: params.title,
                content: params.content,
                tags: params.tags,
                links: params.links,
              });
              break;
            case 'index_workspace':
              result = await indexWorkspace({
                workspace_root: params.workspace_root,
                force: !!params.force,
              });
              break;
            case 'load_skill_prompt': {
              const { loadSkillPrompt } = await import('./tools/load-skill-prompt.js');
              result = await loadSkillPrompt({
                type: params.type,
                name: params.name,
                keywords: params.keywords,
                workspaceDir: params.workspaceDir,
              });
              break;
            }
            case 'store_workspace_skill': {
              const { storeWorkspaceSkill } = await import('./tools/store-workspace-skill.js');
              result = await storeWorkspaceSkill({
                name: params.name,
                description: params.description,
                what: Array.isArray(params.what) ? params.what : [params.what],
                why: params.why,
                files: params.files,
                workspace_root: params.workspace_root,
              });
              break;
            }
            case 'cyber_tool':
              result = await cyberTool(params);
              break;
            case 'quantum_tool': {
              const { quantumTool } = await import('./tools/quantum-tool.js');
              result = await quantumTool(params);
              break;
            }
            default:
              res.status(400).json({ error: `Unknown tool: ${tool}` });
              return;
          }
          res.json({ ok: true, latencyMs: Date.now() - start, result });
        } catch (err: any) {
          res.status(500).json({ ok: false, latencyMs: Date.now() - start, error: String(err?.message || err) });
        }
      });

      // File upload for the Tool Playground chatbox — image/PDF attachments.
      // Stored under the selected workspace so vision_tool's boundary check and
      // use-free-llm's file:// resolver (both scoped to workspace_root) can read them back.
      const uploadStorage = multer.memoryStorage();
      const upload = multer({
        storage: uploadStorage,
        limits: { fileSize: 20 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
          } else {
            cb(new Error('Only image and PDF files are allowed'));
          }
        },
      });

      app.post('/api/upload', upload.single('file'), async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const file = (req as any).file as Express.Multer.File | undefined;
          if (!file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
          }
          const workspaceRoot = (req.body?.workspace_root || '').toString().trim();
          const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

          let destDir: string;
          let relativePath: string | undefined;
          if (workspaceRoot) {
            const wsAbs = path.resolve(workspaceRoot);
            
            // Path traversal safety gate: restrict allowed roots
            const normAbs = wsAbs.replace(/\\/g, '/');
            const allowedPrefixes = [
              process.cwd().replace(/\\/g, '/'),
              os.homedir().replace(/\\/g, '/'),
              path.join(os.homedir(), '.anthropic', 'artifacts').replace(/\\/g, '/'),
              path.join(os.homedir(), '.openai', 'artifacts').replace(/\\/g, '/'),
              path.join(os.homedir(), '.codex', 'artifacts').replace(/\\/g, '/'),
              path.join(os.homedir(), '.gemini', 'antigravity').replace(/\\/g, '/'),
            ];
            const isSafe = allowedPrefixes.some(prefix => {
              const normPrefix = prefix.replace(/\/$/, '') + '/';
              return normAbs === prefix || normAbs.startsWith(normPrefix);
            });
            
            if (!isSafe) {
              res.status(400).json({ error: 'workspace_root path traversal check failed (Security Gate)' });
              return;
            }

            destDir = path.join(wsAbs, '.mcp-uploads');
            relativePath = path.join('.mcp-uploads', safeName);
          } else {
            destDir = path.join(os.tmpdir(), 'mcp-uploads');
          }

          await fsp.mkdir(destDir, { recursive: true });
          const absPath = path.join(destDir, safeName);
          await fsp.writeFile(absPath, file.buffer);

          const fileUri = 'file:///' + absPath.replace(/\\/g, '/');
          const kind = file.mimetype === 'application/pdf' ? 'pdf' : 'image';
          res.json({ absPath, fileUri, relativePath: relativePath?.replace(/\\/g, '/'), kind });
        } catch (err: any) {
          res.status(500).json({ error: String(err?.message || err) });
        }
      });

      // Expose available model IDs for the playground model picker
      app.get('/api/models', async (_req, res) => {
        try {
          const data = await listAvailableFreeModels({});
          res.json(data);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // Browser Tool Scraper API Endpoint — routes through the same action
      // dispatcher as the MCP tool (src/browser/dispatch.ts), not a second copy,
      // so both entry points share one BrowserSessionPool per process.
      app.post('/api/browser_tool', express.json({ limit: '10mb' }), async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const { dispatchBrowserAction } = await import('./browser/dispatch.js');
          const result = await dispatchBrowserAction(req.body);
          res.status(result.success ? 200 : 502).json(result);
        } catch (err: any) {
          res.status(500).json({ error: String(err?.message || err) });
        }
      });

      // Cyber Tool Security Registry & Wiki API Endpoint
      app.post('/api/cyber_tool', express.json({ limit: '10mb' }), async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const result = await cyberTool(req.body);
          res.json(result);
        } catch (err: any) {
          res.status(500).json({ error: String(err?.message || err) });
        }
      });

      // Dashboard-facing convenience wrapper around cyber_tool's existing
      // 'load_graph' action (v1.0.9) — the decision-graph nodes/edges it
      // returns are already exactly what the dashboard's task-graph
      // visualization needs, so this just narrows the generic action-based
      // endpoint above to a plain GET for that one read.
      app.get('/api/cyber_tool/task_graph/:sessionId', async (req, res) => {
        try {
          const result = await cyberTool({ action: 'load_graph', sessionId: req.params.sessionId });
          res.json(result);
        } catch (err: any) {
          res.status(500).json({ error: String(err?.message || err) });
        }
      });

      // Quantum Tool — multi-branch/persona reasoning aid (v1.0.9)
      app.post('/api/quantum_tool', express.json({ limit: '2mb' }), async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const { quantumTool } = await import('./tools/quantum-tool.js');
          const result = await quantumTool(req.body);
          res.status(result.success ? 200 : 400).json(result);
        } catch (err: any) {
          res.status(500).json({ error: String(err?.message || err) });
        }
      });

      app.get('/api/quantum_tool/state/:sessionId', async (req, res) => {
        try {
          const { quantumTool } = await import('./tools/quantum-tool.js');
          const result = await quantumTool({ action: 'get_state', sessionId: req.params.sessionId } as any);
          res.status(result.success ? 200 : 404).json(result);
        } catch (err: any) {
          res.status(500).json({ error: String(err?.message || err) });
        }
      });

      // List all agentic sessions with chat-log metadata (msgCount, lastTs)
      app.get('/api/sessions', async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const projectsBase = path.join(os.homedir(), '.free-llm-mcp', 'projects');
          try { await fsp.access(projectsBase); } catch { return res.json({ sessions: [] }); }

          // Denylist: exclude test/benchmark/fixture directories that pollute the sidebar
          const DENYLIST_PREFIXES = ['test-', 'bench-', 'smoke-', 'stress-', 'full-stress-', 'e2e-', 'simulation-', 'study-'];

          const entries = await fsp.readdir(projectsBase);
          const MAX_CONCURRENT = 20;
          type SessionMeta = { id: string; msgCount: number; lastTs: number };
          const sessions: SessionMeta[] = [];

          for (let i = 0; i < entries.length; i += MAX_CONCURRENT) {
            const batch = entries.slice(i, i + MAX_CONCURRENT);
            const results = await Promise.all(batch.map(async d => {
              // Skip test/benchmark artifact directories
              if (DENYLIST_PREFIXES.some(prefix => d.startsWith(prefix))) return null;
              const full = path.resolve(projectsBase, d);
              if (path.dirname(full) !== path.resolve(projectsBase)) return null;
              try {
                const stat = await fsp.stat(full);
                if (!stat.isDirectory()) return null;
                let msgCount = 0; let lastTs = stat.mtimeMs;
                try {
                  const log: any[] = JSON.parse(await fsp.readFile(path.join(full, 'chat-log.json'), 'utf-8'));
                  msgCount = log.length;
                  if (log.length) lastTs = Math.max(lastTs, log[log.length - 1].ts || 0);
                } catch {}
                return { id: d, msgCount, lastTs } as SessionMeta;
              } catch { return null; }
            }));
            sessions.push(...results.filter((s): s is SessionMeta => s !== null));
          }

          // Ensure __no_ws__ is always present in the list
          if (!sessions.some(s => s.id === '__no_ws__')) {
            let msgCount = 0; let lastTs = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago default
            try {
              const log: any[] = JSON.parse(await fsp.readFile(path.join(projectsBase, '__no_ws__', 'chat-log.json'), 'utf-8'));
              msgCount = log.length;
              if (log.length) lastTs = log[log.length - 1].ts || Date.now();
            } catch {}
            sessions.push({ id: '__no_ws__', msgCount, lastTs });
          }

          sessions.sort((a, b) => b.lastTs - a.lastTs);
          res.json({ sessions });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // Return knowledge.md content and momentum queues for a given session
      app.get('/api/memory/:sessionId', async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const { sessionId } = req.params;
          // Step 1: Reject IDs with dots-only sequences or characters outside word/hyphen/dot
          if (!/^(?!\.\.?$)[\w\-\.]{1,128}$/.test(sessionId)) {
            res.status(400).json({ error: 'Invalid sessionId' });
            return;
          }
          // Step 2: Resolve and verify the resulting path is a direct child of projects/
          const projectsBase = path.join(os.homedir(), '.free-llm-mcp', 'projects');
          const projectDir = path.resolve(projectsBase, sessionId);
          if (path.dirname(projectDir) !== projectsBase) {
            res.status(400).json({ error: 'Invalid sessionId' });
            return;
          }

          // Phase 3 Optimization: Parallelize knowledge and queue reads
          const [knowledgeRes, queuesRes] = await Promise.all([
            fsp.readFile(path.join(projectDir, 'knowledge.md'), 'utf-8').catch(() => 'No memory yet – session not started.'),
            fsp.readFile(path.join(projectDir, STATE_FILE), 'utf-8').catch(() => null)  // Bug fix: was 'queues.json', real writer uses STATE_FILE (state.json)
          ]);

          // Queue entries are `{id, task}` objects as of the Phase 2 schema migration
          // (AgenticMiddleware.ts's QueueTask) — this endpoint just proxies parsed state.json
          // straight to the dashboard, so `any[]` here (not a duplicated empty-state literal
          // importing AgenticMiddleware.ts) is intentional; it never constructs real entries.
          let queues: Record<string, any[]> = {
            nowQueue: [], nextQueue: [], blockedQueue: [], improveQueue: []
          };
          if (queuesRes) {
            try {
              queues = JSON.parse(queuesRes);
            } catch {
              // Ignore parse errors
            }
          }

          res.json({ sessionId, knowledge: knowledgeRes, queues });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // Helper to read and normalize chat log format (chat-logs.json or chat-log.json)
      async function readNormalizedChatLog(dirPath: string): Promise<any[]> {
        try {
          const raw = await fsp.readFile(path.join(dirPath, 'chat-logs.json'), 'utf-8');
          return JSON.parse(raw);
        } catch {
          try {
            const raw = await fsp.readFile(path.join(dirPath, 'chat-log.json'), 'utf-8');
            return JSON.parse(raw);
          } catch {
            return [];
          }
        }
      }

      // ─── Chat Log API ─────────────────────────────────────────────────────────
      // Resolve workspace path → stable session ID (same hash the agentic tools use)
      // Isolated per CWD: each MCP server instance has its own data/projects/ tree.
      app.post('/api/chat-log/resolve', express.json({ limit: '4kb' }), async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const ws: string = (req.body?.workspace || '').toString().trim();
          if (!ws) return res.json({ sessionId: '__no_ws__' });
          // Bug fix: use the real WorkspaceScanner hash algorithm, not base64 (was producing wrong IDs)
          const hash = await new WorkspaceScanner(process.cwd()).getWorkspaceHash(ws);
          const sessionId = `ws-${hash.substring(0, 16)}`;
          res.json({ sessionId });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // GET /api/chat-log/:sessionId?q=<search>
      // Returns up to 200 turns; filters by q if provided.
      // Read is lock-free (safe for concurrent readers).
      app.get('/api/chat-log/:sessionId', async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const { sessionId } = req.params;
          if (!/^(?!\.\..?)([\w\-\.]{1,64}|__no_ws__)$/.test(sessionId)) {
            return res.status(400).json({ error: 'Invalid sessionId' });
          }
          const projectsBase = path.join(os.homedir(), '.free-llm-mcp', 'projects');
          const dirPath = path.resolve(projectsBase, sessionId);
          // Path traversal guard: must stay within projectsBase
          if (!dirPath.startsWith(path.resolve(projectsBase) + path.sep) && dirPath !== path.resolve(projectsBase, '__no_ws__')) {
            return res.status(400).json({ error: 'Invalid sessionId' });
          }
          const log = await readNormalizedChatLog(dirPath);

          let workspace = '';
          if (sessionId !== '__no_ws__') {
            try {
              const knowledgePath = path.resolve(projectsBase, sessionId, 'knowledge.md');
              const knowledgeContent = await fsp.readFile(knowledgePath, 'utf-8');
              const match = knowledgeContent.match(/<!-- workspace: (.*?) -->/);
              if (match) {
                workspace = match[1].trim();
              }
            } catch {}
          }

          const q = ((req.query.q as string) || '').toLowerCase().trim();
          const filtered = q
            ? log.filter((m: any) => (m.content || '').toLowerCase().includes(q) || (m.tool || '').toLowerCase().includes(q))
            : log;
          res.json({ sessionId, log: filtered.slice(-200), workspace });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // POST /api/steering_eval — Live System Prompt Steering & Ingestion Inspection Endpoint
      app.post('/api/steering_eval', express.json({ limit: '1mb' }), async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const { query = '', keywords = [], agentic = false, workspaceRoot = process.cwd(), sessionId = 'steering-eval-session', subtask } = req.body || {};
          const userKeywords = Array.isArray(keywords)
            ? keywords
            : String(keywords).split(',').map((k: string) => k.trim()).filter(Boolean);

          const effectiveKeywords = userKeywords.length > 0
            ? userKeywords
            : (query ? (query.toLowerCase().match(/\b[a-z]{3,}\b/g)?.filter((w: string) => !['the','and','for','with','from','that','this','have','are','was','were','lets','check','please','could','would','should'].includes(w)).slice(0, 8) || []) : []);

          let resolvedWsRoot = process.cwd();
          if (workspaceRoot && typeof workspaceRoot === 'string') {
            const trimmed = workspaceRoot.trim();
            if (trimmed && !trimmed.includes('\0')) {
              try {
                const candidate = path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(process.cwd(), trimmed);
                if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                  resolvedWsRoot = candidate;
                }
              } catch {}
            }
          }

          const { evaluatePromptSections, getIntelligentSystemPrompt } = await import('./pipeline/middlewares/prompts.js');
          const promptEval = await evaluatePromptSections({
            context: query,
            keywords: effectiveKeywords,
            isSubtask: agentic,
            workspaceRoot: resolvedWsRoot
          });

          const { WorkspaceContextMiddleware } = await import('./pipeline/middlewares/WorkspaceContextMiddleware.js');
          const middleware = new WorkspaceContextMiddleware();

          const hasValidSubtask = subtask && typeof subtask === 'object' && !Array.isArray(subtask) &&
            ((typeof subtask.id === 'string' && subtask.id.trim().length > 0) ||
             (typeof subtask.title === 'string' && subtask.title.trim().length > 0));

          const subtaskObj = hasValidSubtask
            ? {
                id: (typeof subtask.id === 'string' && subtask.id.trim()) || 'subtask-eval-1',
                title: (typeof subtask.title === 'string' && subtask.title.trim()) || `Execute task: ${query || 'System prompt steering test'}`
              }
            : (agentic ? { id: 'subtask-eval-1', title: `Execute task: ${query || 'System prompt steering test'}` } : null);

          const context: any = {
            request: {
              model: 'gemini-3.1-flash-lite',
              agentic: !!agentic,
              messages: [{ role: 'user', content: query || 'Test query' }]
            },
            taskType: 'coder',
            keywords: effectiveKeywords,
            workspaceRoot: resolvedWsRoot,
            sessionId,
            isOnePass: !agentic,
            subtask: subtaskObj
          };

          await middleware.execute(context, async () => {});
          const steeringTelemetry = context.telemetry?.steeringTelemetry || {};
          steeringTelemetry.matchedSections = promptEval.matchedSections;

          // Assemble the real subtask prompt if in agentic mode so users see exactly what the model receives
          let assembledPrompt = promptEval.prompt;
          if (agentic && subtaskObj) {
            const taskHeader = `\n\n## 📝 CURRENT SUBTASK\nYou are currently executing this subtask:\n- **Task**: ${subtaskObj.title}\n- **Subtask ID**: ${subtaskObj.id}\n\nStrictly focus on this subtask using the tools provided.`;
            assembledPrompt = `${promptEval.prompt}${taskHeader}`;
          }
          steeringTelemetry.fullAssembledSystemPrompt = assembledPrompt;

          const sysTokens = promptEval.totalPromptTokens || steeringTelemetry.memoryLayers?.sysPromptTokens || Math.ceil(assembledPrompt.length / 3.8);
          if (!steeringTelemetry.memoryLayers) steeringTelemetry.memoryLayers = {};
          steeringTelemetry.memoryLayers.sysPromptTokens = sysTokens;
          steeringTelemetry.memoryLayers.totalContextTokens = (steeringTelemetry.memoryLayers.shortTermTokens || 0) + (steeringTelemetry.memoryLayers.longTermTokens || 0) + (steeringTelemetry.memoryLayers.wikiTokens || 0) + (steeringTelemetry.memoryLayers.grepTokens || 0) + sysTokens;

          // Structured 5-layer memory hierarchy with explicit priorities and sample extracted text
          const memoryHierarchy = [
            {
              level: 'L1',
              priority: 1,
              name: 'Short-Term Session Memory',
              description: 'Recent conversation turns, immediate user instructions & live subtask execution state',
              tokens: steeringTelemetry.memoryLayers?.shortTermTokens || Math.ceil((query?.length || 10) / 3.8),
              active: true,
              content: context.telemetry?.memoryContext || `Turn 1: User prompt -> "${query || 'Test query'}"`
            },
            {
              level: 'L2',
              priority: 2,
              name: 'Long-Term Memory & ADR Decisions',
              description: 'Project preferences, verified technical rules & architectural decision records (.free-llm-mcp/wiki/adr/)',
              tokens: steeringTelemetry.memoryLayers?.longTermTokens || 0,
              active: (steeringTelemetry.memoryLayers?.longTermTokens || 0) > 0,
              content: context.telemetry?.memoryContext ? `## ADR / Decision Records\n${context.telemetry.memoryContext}` : '(No persistent ADR rules stored for this workspace)'
            },
            {
              level: 'L3',
              priority: 3,
              name: 'Workspace Wiki Knowledge',
              description: 'Curated technical documentation, module catalogues & domain guides (.free-llm-mcp/wiki/)',
              tokens: steeringTelemetry.memoryLayers?.wikiTokens || 0,
              active: (steeringTelemetry.memoryLayers?.wikiTokens || 0) > 0,
              content: context.telemetry?.wikiContext || '(No wiki documentation matched)'
            },
            {
              level: 'L4',
              priority: 4,
              name: 'Dynamic Code Snippets (Born-Rule Grep)',
              description: 'Relevance-scored folder snippets, symbol definitions & dependency graph context',
              tokens: steeringTelemetry.memoryLayers?.grepTokens || 0,
              active: (steeringTelemetry.memoryLayers?.grepTokens || 0) > 0,
              content: context.telemetry?.grepContext || '(No code snippets matched the query keywords)'
            },
            {
              level: 'L5',
              priority: 5,
              name: 'External Prompt & Skill Steering',
              description: 'Keyword-targeted prompt.json sections, persona templates & dynamic skills',
              tokens: sysTokens,
              active: sysTokens > 0,
              content: promptEval.matchedSections.length > 0
                ? promptEval.matchedSections.map(s => `### ${s.title} (${s.id})\n${s.content || ''}`).join('\n\n')
                : `### Baseline System Prompt (${sysTokens} tok)\n${assembledPrompt}`
            }
          ];

          steeringTelemetry.memoryHierarchy = memoryHierarchy;
          steeringTelemetry.extractedWorkspaceContext = context.telemetry?.grepContext || '(No code snippets matched)';
          steeringTelemetry.dirTree = context.telemetry?.dirTree || '';
          steeringTelemetry.keywords = effectiveKeywords;
          steeringTelemetry.chatHistory = [{ role: 'user', content: query || 'Test query' }];

          res.json({
            success: true,
            telemetry: steeringTelemetry
          });
        } catch (err) {
          res.status(500).json({ success: false, error: String(err) });
        }
      });

      // POST /api/chat-log/:sessionId  { role, tool, content, latencyMs, ts }
      // Appends one turn atomically using file lock — safe across concurrent MCP instances.
      app.post('/api/chat-log/:sessionId', express.json({ limit: '512kb' }), async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const { sessionId } = req.params;
          if (!/^(?!\.\..?)([\w\-\.]{1,64}|__no_ws__)$/.test(sessionId)) {
            return res.status(400).json({ error: 'Invalid sessionId' });
          }
          const { role, tool, content, latencyMs, ts } = req.body || {};
          if (!role || !content) return res.status(400).json({ error: 'role and content required' });

          const { logChatTurn } = await import('./utils/ChatLogger.js');
          await logChatTurn(sessionId, { role, tool, content, latencyMs: latencyMs ?? null, ts: ts || Date.now() });

          res.json({ ok: true });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // DELETE /api/chat-log/:sessionId  — clear conversation (with lock)
      app.delete('/api/chat-log/:sessionId', async (req, res) => {
        if (!checkRateLimit(req, res)) return;
        try {
          const { sessionId } = req.params;
          if (!/^(?!\.\..?)([\w\-\.]{1,64}|__no_ws__)$/.test(sessionId)) {
            return res.status(400).json({ error: 'Invalid sessionId' });
          }
          const projectsBase = path.join(os.homedir(), '.free-llm-mcp', 'projects');
          const dir = path.resolve(projectsBase, sessionId);
          const logPath = path.join(dir, 'chat-logs.json');
          const legacyLogPath = path.join(dir, 'chat-log.json');
          await withFileLock(logPath, async () => {
            await writeFileAtomic(logPath, '[]');
            try { await writeFileAtomic(legacyLogPath, '[]'); } catch {}
          });
          res.json({ ok: true });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });

      // v1.0.4 Memory Hardening: Use LRUCache for sessions to prevent memory leaks
      const sessionMap = new LRUCache<string, { server: any, transport: StreamableHTTPServerTransport }>({
        max: 1000,
        ttl: 1000 * 60 * 60, // 1 hour idle TTL
        dispose: (value) => {
          // Attempt to close transport if it's still alive when purged from cache
          try {
            console.error(`[Server] Purging stagnant session: closing transport`);
            value.transport.close();
          } catch (err) {
            // Ignore closure errors for already closed transports
          }
        }
      });

      const handleMcpRequest = async (req: express.Request, res: express.Response) => {
        // Support for dashboard status heartbeat
        if (req.method === 'GET' && req.query.heartbeat === 'true') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });
          res.write('event: heartbeat\ndata: {"status":"online"}\n\n');
          const interval = setInterval(() => {
            res.write(': heartbeat\n\n'); // SSE comment to keep alive
          }, 15000);
          req.on('close', () => clearInterval(interval));
          return;
        }

        const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);

        if (sessionId && sessionMap.has(sessionId)) {
          const { transport } = sessionMap.get(sessionId)!;
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // For new sessions (GET or POST initialize)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });

        const sessionServer = await createMCPServer();
        await sessionServer.connect(transport);

        await transport.handleRequest(req, res, req.body);

        if (transport.sessionId) {
          sessionMap.set(transport.sessionId, { server: sessionServer, transport });

          // Cleanup on close
          transport.onclose = () => {
            if (transport.sessionId) {
              sessionMap.delete(transport.sessionId);
            }
          };
        }
      };

      app.all('/mcp', handleMcpRequest);

      // Backwards compatibility aliases
      app.get('/sse', handleMcpRequest);
      app.post('/messages', handleMcpRequest);

      // Serve dashboard static files
      const dashboardPath = path.join(__dirname, '../dashboard');
      app.use(express.static(dashboardPath));

      // Auto-deploy/check SearXNG Docker container if docker is available
      import('./search/searxng-deploy.js').then(({ ensureSearxngContainer }) => {
        ensureSearxngContainer();
      }).catch(err => {
        console.error('[SearXNG Startup Check Error]:', err?.message || err);
      });

      const serverInstance = app.listen(port, () => {
        console.error(`MCP Dashboard & SSE Server running on http://localhost:${port}`);
        console.error(`Unified endpoint: http://localhost:${port}/mcp`);
      });

      // Graceful shutdown
      const shutdown = async () => {
        console.error('Shutting down server...');

        // Flush persistence
        try {
          await flushSystem();
          console.error('Persistence flushed');
        } catch (err) {
          console.error('Failed to flush persistence:', err);
        }

        try {
          const { getBrowserSessionPool } = await import('./browser/BrowserSessionPool.js');
          await getBrowserSessionPool().shutdownAll();
        } catch (err) {
          console.error('Failed to close browser sessions:', err);
        }

        serverInstance.close(() => {
          console.error('Server closed');
          process.exit(0);
        });

        // Force exit after 5s
        setTimeout(() => process.exit(1), 5000);
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } else {
      const server = await createMCPServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('MCP server running on stdio');

      // Same usage-persistence gap as the SSE path: without this, every stdio
      // session teardown (the common case for real MCP clients like Claude
      // Desktop) drops any usage counters still sitting in the 2s debounce window.
      const stdioShutdown = async () => {
        try {
          await flushSystem();
        } catch (err) {
          console.error('Failed to flush persistence:', err);
        }
        try {
          const { getBrowserSessionPool } = await import('./browser/BrowserSessionPool.js');
          await getBrowserSessionPool().shutdownAll();
        } catch (err) {
          console.error('Failed to close browser sessions:', err);
        }
        process.exit(0);
      };
      process.on('SIGTERM', stdioShutdown);
      process.on('SIGINT', stdioShutdown);
    }
  } catch (err: any) {
    console.error(`[FATAL] Startup failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
