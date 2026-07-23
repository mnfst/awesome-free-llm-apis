import { beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';

/**
 * Call this in your describe() block to get a fresh, isolated tmp workspace
 * and guarantee all cache layers are reset before and after every test.
 *
 * Usage:
 *   const { getWsRoot } = useCacheIsolation();
 *   // getWsRoot() returns a unique tmp dir path for the active test
 */
export function useCacheIsolation() {
    let currentWsRoot = '';

    beforeEach(async () => {
        currentWsRoot = path.join(os.tmpdir(), `mcp-test-${crypto.randomBytes(4).toString('hex')}`);
        await fs.mkdir(currentWsRoot, { recursive: true });
    });

    afterEach(async () => {
        try {
            const { memoryManager } = await import('../../src/memory/index.js');
            memoryManager.shortTerm.clear();
        } catch {}

        try {
            const { resetAllInstances, getSharedResponseCache } = await import('../../src/pipeline/instances.js');
            try {
                getSharedResponseCache().flush();
            } catch {}
            resetAllInstances();
        } catch {}

        try {
            const { GlobalWikiManager } = await import('../../src/utils/GlobalWikiManager.js');
            (GlobalWikiManager as any).reset?.();
        } catch {}

        try {
            const { __test_clearCache } = await import('../../src/pipeline/middlewares/context-gatherer.js');
            __test_clearCache();
        } catch {}

        if (currentWsRoot) {
            try {
                await fs.rm(currentWsRoot, { recursive: true, force: true });
            } catch {}
        }
    });

    return {
        getWsRoot: () => currentWsRoot
    };
}
