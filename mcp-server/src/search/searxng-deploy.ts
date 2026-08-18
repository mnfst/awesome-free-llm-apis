import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Safe zero-dependency .env loader for CLI invocation
try {
  const envPath = path.resolve(__dirname, '../../.env');
  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch {}

/**
 * Checks if Docker is available on host, pulls `searxng/searxng`, and deploys
 * SearXNG container in the background on the port specified by SEARXNG_URL (default: 8080).
 * If Docker is unavailable (`docker --version` fails), skips silently with a warning.
 */
export function ensureSearxngContainer(): boolean {
  try {
    spawnSync('docker', ['--version'], { stdio: 'pipe' });
    spawnSync('docker', ['info'], { stdio: 'pipe' });
  } catch {
    console.error('[SearXNG Docker] Docker CLI or daemon not available/active; skipping SearXNG Docker deployment.');
    return false;
  }

  try {
    const rawUrl = process.env.SEARXNG_BASE_URL || process.env.SEARXNG_URL || 'http://localhost:8080';
    let port = 8080;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.port) port = parseInt(parsed.port, 10);
    } catch {}

    const containerName = 'searxng-awesome-free-llm';
    const searxngDir = path.resolve(process.cwd(), 'scratch/searxng-config');
    mkdirSync(searxngDir, { recursive: true });
    const settingsPath = path.resolve(searxngDir, 'settings.yml');

    const generatedSecretKey = crypto.randomBytes(32).toString('hex');
    const settingsContent = `use_default_settings: true
server:
  bind_address: "0.0.0.0"
  secret_key: "${generatedSecretKey}"
  limiter: false
search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json
`;

    writeFileSync(settingsPath, settingsContent, 'utf-8');
    console.error(`[SearXNG Docker] Updated settings.yml with json format enabled at ${settingsPath}`);

    // Always recreate container to ensure volume mount and settings are strictly applied
    try {
      spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    } catch {}

    console.error('[SearXNG Docker] Pulling searxng/searxng image...');
    spawnSync('docker', ['pull', 'searxng/searxng'], { stdio: 'inherit' });

    console.error(`[SearXNG Docker] Deploying background SearXNG container on port ${port} with JSON enabled...`);
    // Convert Windows backslashes to forward slashes for Docker volume compatibility
    const normalizedSettingsPath = settingsPath.replace(/\\/g, '/');
    spawnSync('docker', [
      'run', '-d',
      '--name', containerName,
      '-v', `${normalizedSettingsPath}:/etc/searxng/settings.yml`,
      '-p', `127.0.0.1:${port}:8080`,
      'searxng/searxng'
    ], { stdio: 'inherit' });

    console.error(`[SearXNG Docker] Successfully deployed SearXNG on http://localhost:${port}`);
    return true;
  } catch (err: any) {
    console.warn('[SearXNG Docker] Deployment warning:', err?.message || String(err));
    return false;
  }
}

// Auto-run if executed directly via node
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('searxng-deploy.ts') || process.argv[1]?.endsWith('searxng-deploy.js')) {
  ensureSearxngContainer();
}
