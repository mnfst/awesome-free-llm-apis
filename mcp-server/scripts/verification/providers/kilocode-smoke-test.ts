/**
 * @file kilocode-smoke-test.ts
 * @description Verifies models added/removed for the Kilo Code provider by the
 * 2026-07-30 upstream data.json merge. Usage: tsx scripts/verification/providers/kilocode-smoke-test.ts
 */
import 'dotenv/config';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import { KiloCodeProvider } from '../../../src/providers/kilocode.js';
import { CHANGED_MODELS } from './_changed-models.js';

async function testModel(provider: KiloCodeProvider, id: string) {
    console.error(`[>] Testing Model: ${id}`);
    try {
        const start = Date.now();
        const res = await provider.chat({
            model: id,
            messages: [{ role: 'user', content: 'Say "OK"' }],
            max_tokens: 5
        });
        const duration = Date.now() - start;
        const content = res.choices[0]?.message?.content ?? '';
        console.error(`    Status: SUCCESS / FREE (${duration}ms)`);
        console.error(`    Response: "${content.trim()}"`);
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

async function runKiloCodeSmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const kilo = registry.getProvider('kilocode') as KiloCodeProvider;

    if (!kilo) {
        console.error('Kilo Code provider not found in registry.');
        process.exit(1);
    }

    if (!kilo.isAvailable()) {
        console.error('Kilo Code provider is not available (check KILO_API_KEY).');
        process.exit(1);
    }

    const { added, removed } = CHANGED_MODELS.kilocode;

    console.error(`\n=== Kilo Code Changed-Model Smoke Test ===`);
    console.error(`Added models: ${added.length} | Removed models: ${removed.length}\n`);

    console.error(`--- Added models ---\n`);
    const addedResults = [];
    for (const id of added) addedResults.push(await testModel(kilo, id));

    console.error(`--- Removed models (checking if they still work) ---\n`);
    const removedResults = [];
    for (const id of removed) removedResults.push(await testModel(kilo, id));

    console.log(`\n=== Results Summary: Kilo Code ===`);
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

runKiloCodeSmokeTest().catch(error => {
    console.error('Fatal error during Kilo Code smoke test:', error);
    process.exit(1);
});
