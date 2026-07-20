import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPersona } from '../src/utils/persona-detector.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('PersonaDetector (Phase D)', () => {
    // Outside the repo tree so the .agents/AGENTS.md parent-walk-up
    // (findAgentsMdPath) can't escape into this repo's real .agents/AGENTS.md.
    const tempDir = path.join(os.tmpdir(), `free-llm-mcp-persona-test-${Date.now()}`);

    beforeEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('detects coder persona from coding keywords', () => {
        const query = 'implement a new class for JWT validation';
        const persona = detectPersona(query);
        expect(persona).toBe('coder');
    });

    it('detects researcher persona from pdf references', () => {
        const query = 'check the results in pdf://paper-2026.pdf and compile citations';
        const persona = detectPersona(query);
        expect(persona).toBe('researcher');
    });

    it('detects student persona from tutorial queries', () => {
        const query = 'explain how quantum computing superposition works in simple terms';
        const persona = detectPersona(query);
        expect(persona).toBe('student');
    });

    it('detects debugger persona from error patterns', () => {
        const query = 'fix TypeError: Cannot read properties of undefined (reading modelId) in ts(2353)';
        const persona = detectPersona(query);
        expect(persona).toBe('debugger');
    });

    it('falls back to generic persona when no signals are present', () => {
        const query = 'hello there, how are you';
        const persona = detectPersona(query);
        expect(persona).toBe('generic');
    });

    it('AGENTS.md persona override takes precedence over detected persona', async () => {
        // Create AGENTS.md with override
        await fs.writeFile(path.join(tempDir, 'AGENTS.md'), 'Preferred Persona: student\n', 'utf-8');

        const query = 'implement a new class for JWT validation'; // normally coder
        const persona = detectPersona(query, tempDir);
        expect(persona).toBe('student');
    });
});
