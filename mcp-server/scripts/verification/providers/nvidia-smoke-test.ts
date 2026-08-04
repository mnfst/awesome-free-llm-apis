/**
 * @file nvidia-smoke-test.ts
 * @description Verifies models added/removed for the NVIDIA NIM provider by the
 * 2026-07-30 upstream data.json merge. Usage: tsx scripts/verification/providers/nvidia-smoke-test.ts
 */
import 'dotenv/config';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import { NvidiaProvider } from '../../../src/providers/nvidia.js';
import { CHANGED_MODELS } from './_changed-models.js';

async function testModel(provider: NvidiaProvider, id: string) {
    console.error(`[>] Testing Model: ${id}`);
    try {
        const start = Date.now();
        const res = await provider.chat({
            model: id,
            messages: [{ role: 'user', content: 'Say "OK"' }],
            max_tokens: 5
        });
        const duration = Date.now() - start;
        console.error(`    Status: SUCCESS / FREE (${duration}ms)`);
        console.error(`    Response: "${res.choices[0].message.content.trim()}"`);
        return { id, status: 'FREE' as const };
    } catch (error: any) {
        const errMsg = error.message || '';
        if (errMsg.includes('requires a subscription') || errMsg.includes('402') || errMsg.includes('403')) {
            console.error(`    Status: PAID (Requires subscription)`);
            return { id, status: 'PAID' as const, error: errMsg };
        }
        console.error(`    Status: FAILED`);
        console.error(`    Error: ${errMsg}`);
        return { id, status: 'FAILED' as const, error: errMsg };
    } finally {
        console.error('');
    }
}

async function runNvidiaSmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const nvidia = registry.getProvider('nvidia') as NvidiaProvider;

    if (!nvidia) {
        console.error('NVIDIA provider not found in registry.');
        process.exit(1);
    }

    if (!nvidia.isAvailable()) {
        console.error('NVIDIA provider is not available (check NVIDIA_API_KEY).');
        process.exit(1);
    }

    const { added, removed } = CHANGED_MODELS.nvidia;

    console.error(`\n=== NVIDIA NIM Changed-Model Smoke Test ===`);
    console.error(`Added models: ${added.length} | Removed models: ${removed.length}\n`);

    console.error(`--- Added models ---\n`);
    const addedResults = [];
    for (const id of added) addedResults.push(await testModel(nvidia, id));

    console.error(`--- Removed models (checking if they still work) ---\n`);
    const removedResults = [];
    for (const id of removed) removedResults.push(await testModel(nvidia, id));

    console.log(`\n=== Results Summary: NVIDIA NIM ===`);
    console.log(`\nAdded models:`);
    addedResults.forEach(r => console.log(`  [${r.status}] ${r.id}${r.status !== 'FREE' ? ` — ${r.error}` : ''}`));
    console.log(`\nRemoved models (still-works vs confirmed-dead):`);
    if (removedResults.length === 0) {
        console.log('  None removed for this provider.');
    } else {
        removedResults.forEach(r => console.log(`  [${r.status === 'FREE' ? 'STILL-WORKS' : 'CONFIRMED-DEAD/' + r.status}] ${r.id}${r.status !== 'FREE' ? ` — ${r.error}` : ''}`));
    }
    console.log(`\n=== Test Completed ===\n`);
}

runNvidiaSmokeTest().catch(error => {
    console.error('Fatal error during NVIDIA smoke test:', error);
    process.exit(1);
});
