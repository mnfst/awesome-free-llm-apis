import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('Encryption key persistence', () => {
    const testHome = path.join(os.tmpdir(), 'mcp-encryption-test-' + Date.now());

    beforeEach(async () => {
        await fs.ensureDir(testHome);
        vi.stubEnv('MCP_SECRET_KEY', '');
        vi.spyOn(os, 'homedir').mockReturnValue(testHome);
        vi.resetModules();
    });

    afterEach(async () => {
        await fs.remove(testHome);
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('memoizes the key in-process: only the first call touches the key file, later calls reuse the cached key', async () => {
        const encryption = await import('../src/utils/encryption.js');

        // First call generates+writes the key, then reads back whatever landed on
        // disk (see encryption.ts) — exactly one key-file read for this bootstrap.
        const first = await encryption.encrypt('hello');
        await encryption.decrypt(first);

        const readFileSpy = vi.spyOn(fs, 'readFile');
        const second = await encryption.encrypt('world');
        await encryption.decrypt(second);

        // No further calls should touch the key file — cachedKey is reused.
        const keyFileReads = readFileSpy.mock.calls.filter(call =>
            typeof call[0] === 'string' && call[0].endsWith('.key')
        );
        expect(keyFileReads.length).toBe(0);
    });

    it('two racing first-run key generations converge on the same key instead of silently diverging', async () => {
        const keyPath = path.join(testHome, '.free-llm-mcp', '.key');

        // Simulate two separate processes racing to generate the key by importing
        // the module fresh twice (isolated module registries => independent
        // in-memory caches, both starting with no key file present).
        vi.resetModules();
        const encryptionA = await import('../src/utils/encryption.js');
        vi.resetModules();
        const encryptionB = await import('../src/utils/encryption.js');

        // Race: both attempt to generate+persist a key concurrently for a fresh path.
        const [cipherA, cipherB] = await Promise.all([
            encryptionA.encrypt('from-a'),
            encryptionB.encrypt('from-b'),
        ]);

        expect(await fs.pathExists(keyPath)).toBe(true);

        // Whichever process's key ended up on disk, BOTH ciphertexts must be
        // decryptable by a third fresh module instance reading that one file —
        // proving neither process silently encrypted with a losing/orphaned key.
        vi.resetModules();
        const encryptionC = await import('../src/utils/encryption.js');
        await expect(encryptionC.decrypt(cipherA)).resolves.toBe('from-a');
        await expect(encryptionC.decrypt(cipherB)).resolves.toBe('from-b');
    });
});
