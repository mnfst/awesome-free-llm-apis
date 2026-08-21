import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { afterAll } from 'vitest';

const testSandboxDir = path.join(os.tmpdir(), `free-llm-mcp-test-env-${process.pid}`);
fs.ensureDirSync(testSandboxDir);

// Guarantee tests NEVER touch or overwrite user's live ~/.free-llm-mcp or live Firebase identity
process.env.MCP_USAGE_PATH = path.join(testSandboxDir, 'usage-stats.json');
process.env.FREE_LLM_MCP_HOME = testSandboxDir;
process.env.MEMORY_STORE_PATH = path.join(testSandboxDir, 'memory.json');
process.env.CACHE_STORE_PATH = path.join(testSandboxDir, 'cache.json');
process.env.VECTOR_STORAGE_ROOT = path.join(testSandboxDir, 'vector-indices');

afterAll(async () => {
    try {
        await fs.remove(testSandboxDir);
    } catch {}
});
