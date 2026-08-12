/**
 * @file postbuild.js
 * @description Handles post-build cleanup, script synchronization, and directory preparation for the production distribution.
 * Usage: node scripts/utils/postbuild.js
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const copies = [
  { from: 'src/providers/gemini_client.py', to: 'dist/providers/gemini_client.py' },
  { from: 'scripts/utils/update_prompt_json.py', to: 'dist/scripts/update_prompt_json.py' },
  { from: 'scripts/utils/pdf_screenshot.py', to: 'dist/scripts/pdf_screenshot.py' },
];

console.log('Running post-build tasks...');

// Step 1: Ensure Python virtual environment and dependencies exist
try {
  console.log('Setting up Python virtual environment...');
  const venvDir = resolve(root, 'venv');
  const isWin = process.platform === 'win32';
  const pythonPath = isWin
    ? resolve(venvDir, 'Scripts', 'python.exe')
    : resolve(venvDir, 'bin', 'python');

  if (!existsSync(venvDir)) {
    console.log('Creating virtual environment...');
    const sysPython = isWin ? 'python' : 'python3';
    execSync(`"${sysPython}" -m venv "${venvDir}"`, { stdio: 'inherit' });
  }

  console.log('Installing/upgrading Python dependencies (pymupdf, google-genai, duckduckgo-mcp-server)...');
  execSync(`"${pythonPath}" -m pip install pymupdf google-genai duckduckgo-mcp-server`, { stdio: 'inherit' });
  console.log('Python virtual environment setup complete.');
} catch (err) {
  console.error('Warning: Python virtual environment setup failed. Details:', err.message);
}

for (const { from, to } of copies) {
  const src = resolve(root, from);
  const dest = resolve(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`  copied ${from} → ${to}`);
}

// Step 1.5: Pre-download embedding models
try {
    console.log('Pre-downloading embedding models...');
    const downloadScript = resolve(root, 'scripts/utils/download-models.js');
    execSync(`node "${downloadScript}"`, { stdio: 'inherit' });
} catch (err) {
    console.warn('Warning: Model download failed. Details:', err.message);
}

// Step 2: Run Python prompt extraction
try {
    console.log('Synchronizing system prompt via Python...');
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = resolve(root, 'scripts/utils/update_prompt_json.py');

    // Resolve agent prompt path deterministically for monorepo and standalone layouts.
    const localPromptDir = resolve(root, 'external/agent-prompt');
    const repoPromptDir = resolve(root, '../external/agent-prompt');
    const candidates = [process.env.AGENT_PROMPT_PATH, localPromptDir, repoPromptDir]
      .filter(Boolean);

    const resolvedPromptDir = candidates.find((dir) => existsSync(resolve(dir, 'README.md')));
    if (resolvedPromptDir) {
      console.log(`Using AGENT_PROMPT_PATH=${resolvedPromptDir}`);
    } else {
      console.warn('Warning: Could not auto-resolve AGENT_PROMPT_PATH from expected locations.');
    }

    execSync(`${pythonPath} "${scriptPath}"`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(resolvedPromptDir ? { AGENT_PROMPT_PATH: resolvedPromptDir } : {}),
      },
    });
} catch (err) {
    console.error('Warning: Prompt synchronization failed. Details:', err.message);
}

// Step 3: Deploy SearXNG Docker container if docker --version is available
try {
  console.log('Checking Docker availability for SearXNG deployment...');
  const { ensureSearxngContainer } = await import('../../src/search/searxng-deploy.js');
  ensureSearxngContainer();
} catch (err) {
  console.warn('Warning: SearXNG Docker deployment check skipped. Details:', err.message);
}

