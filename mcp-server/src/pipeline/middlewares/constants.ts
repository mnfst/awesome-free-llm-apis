import path from 'path';
import os from 'os';

/**
 * Shared constants for Agentic Middleware state management
 */

// Centralized storage for all MCP projects
export const PROJECTS_DIR = path.join(os.homedir(), '.free-llm-mcp', 'projects');

// Artifact Filenames
export const STATE_FILE = 'state.json';
export const KNOWLEDGE_FILE = 'knowledge.md';

// Headers
export const SESSION_STATE_HEADER = '## MCP INTERNAL SESSION STATE';

// Exclusion patterns for workspace walking
export const EXCLUDE_DIRS = [
    'node_modules',
    '.git',
    '.github',
    '.next',
    'dist',
    'build',
    '.gemini',
    '.venv',
    'venv',
    '__pycache__',
    '.pytest_cache',
    '.continue',
    '.free-llm-mcp',
    '.agents',
    '.cache',
    '.turbo',
    'data',
    'data/cache',
    'artifacts',
    'out',
    'coverage',
    'bower_components',
    'jspm_packages',
    'temp',
    'tmp'
];

export const EXCLUDE_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.mp4', '.webm', '.ogg', '.mp3', '.wav',
    '.pdf', '.zip', '.tar.gz', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
    '.woff', '.woff2', '.ttf', '.otf',
    '.map', '.log', '.pyc', '.pyo', '.pyd',
    '.db', '.sqlite', '.obj', '.o', '.a', '.lib',
    '.tmp', '.lock'
];

// Local workspace artifacts
export const LOCAL_SKILLS_DIR = path.join('.free-llm-mcp', 'skills');

// Performance boundaries for WorkspaceWalker
export const MAX_DEPTH = 5;
export const MAX_FILES_SCANNED = 5000;

// Wall-clock budget for a single use_free_llm agentic call before it yields a partial
// result + resume handle instead of continuing to block. Many MCP clients (code editors)
// kill a tool call at ~30s; default leaves headroom for serialization + the final persist.
export const SUBTASK_BUDGET_MS = Number(process.env.MCP_SUBTASK_BUDGET_MS ?? 20_000);

