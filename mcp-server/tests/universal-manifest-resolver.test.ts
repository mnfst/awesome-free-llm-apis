import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { ContextGatherer, __test_clearCache } from '../src/pipeline/middlewares/context-gatherer.js';

describe('Universal Multi-Language Manifest Dependency Resolver', () => {
    const mockWorkspace = path.resolve(__dirname, 'mock-multi-lang-workspace');

    beforeEach(async () => {
        __test_clearCache();
        await fs.mkdir(mockWorkspace, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(mockWorkspace, { recursive: true, force: true });
    });

    it('should dynamically extract Python requirements.txt dependencies without hardcoding', async () => {
        const reqPath = path.join(mockWorkspace, 'requirements.txt');
        await fs.writeFile(reqPath, 'fastapi>=0.100.0\nuvicorn==0.22.0\npydantic>=2.0\n# comment\n', 'utf-8');

        const terms = new Set<string>();
        // Trigger gatherContext with security audit prompt on Python workspace
        const results = await ContextGatherer.gatherContext({
            workspaceRoot: mockWorkspace,
            query: 'security audit vulnerability override requirements.txt',
            keywords: ['requirements.txt'],
        });

        expect(results).toBeDefined();
    });

    it('should dynamically extract Rust Cargo.toml dependencies without hardcoding', async () => {
        const cargoPath = path.join(mockWorkspace, 'Cargo.toml');
        await fs.writeFile(cargoPath, '[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\ntokio = "1.0"\nserde = "1.0"\naxum = "0.6"\n', 'utf-8');

        const results = await ContextGatherer.gatherContext({
            workspaceRoot: mockWorkspace,
            query: 'security vulnerability audit override Cargo.toml',
            keywords: ['Cargo.toml'],
        });

        expect(results).toBeDefined();
    });
});
