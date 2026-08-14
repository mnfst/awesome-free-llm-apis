import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Checks if Docker is available on host, pulls `searxng/searxng`, and deploys
 * SearXNG container in the background on the port specified by SEARXNG_URL (default: 8080).
 * If Docker is unavailable (`docker --version` fails), skips silently with a warning.
 */
export function ensureSearxngContainer(): boolean {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    execSync('docker info', { stdio: 'pipe' });
  } catch {
    console.log('[SearXNG Docker] Docker CLI or daemon not available/active; skipping SearXNG Docker deployment.');
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

    const settingsContent = `use_default_settings: true
server:
  bind_address: "0.0.0.0"
  secret_key: "awesome-free-llm-apis-secret-key-searxng-token"
  limiter: false
search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json
`;

    writeFileSync(settingsPath, settingsContent, 'utf-8');
    console.log(`[SearXNG Docker] Updated settings.yml with json format enabled at ${settingsPath}`);

    // Always recreate container to ensure volume mount and settings are strictly applied
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {}

    console.log('[SearXNG Docker] Pulling searxng/searxng image...');
    execSync('docker pull searxng/searxng', { stdio: 'inherit' });

    console.log(`[SearXNG Docker] Deploying background SearXNG container on port ${port} with JSON enabled...`);
    // Convert Windows backslashes to forward slashes for Docker volume compatibility
    const normalizedSettingsPath = settingsPath.replace(/\\/g, '/');
    execSync(`docker run -d --name ${containerName} -v "${normalizedSettingsPath}:/etc/searxng/settings.yml" -p 127.0.0.1:${port}:8080 searxng/searxng`, { stdio: 'inherit' });

    console.log(`[SearXNG Docker] Successfully deployed SearXNG on http://localhost:${port}`);
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
