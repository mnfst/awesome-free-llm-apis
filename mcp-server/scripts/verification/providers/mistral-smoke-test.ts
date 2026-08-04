/**
 * @file mistral-smoke-test.ts
 * @description Verifies all models defined in the Mistral provider and identifies which are free.
 * Usage: tsx scripts/verification/providers/mistral-smoke-test.ts
 */
import 'dotenv/config';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import { MistralProvider } from '../../../src/providers/mistral.js';
import { CHANGED_MODELS } from './_changed-models.js';

async function runMistralSmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const mistral = registry.getProvider('mistral') as MistralProvider;

    if (!mistral) {
        console.error('Mistral provider not found in registry.');
        process.exit(1);
    }

    if (!mistral.isAvailable()) {
        console.error('Mistral provider is not available (check MISTRAL_API_KEY in your env).');
        process.exit(1);
    }

    console.error(`\n=== Mistral     Model Smoke Test ===`);
    console.error(`Testing ${mistral.models.length} models...\n`);

    const freeModels: { id: string; name: string }[] = [];
    const paidModels: { id: string; name: string }[] = [];
    const failedModels: { id: string; name: string; error: string }[] = [];

    for (const model of mistral.models) {
        console.error(`[>] Testing Model: ${model.id} (${model.name})`);
        try {
            const start = Date.now();
            const res = await mistral.chat({
                model: model.id,
                messages: [{ role: 'user', content: 'Say "OK"' }],
                max_tokens: 5
            });
            const duration = Date.now() - start;
            console.error(`    Status: SUCCESS / FREE (${duration}ms)`);
            console.error(`    Response: "${res.choices[0].message.content.trim()}"`);
            freeModels.push(model);
        } catch (error: any) {
            const errMsg = error.message || '';
            if (errMsg.includes('requires a subscription') || errMsg.includes('403')) {
                console.error(`    Status: PAID (Requires subscription)`);
                paidModels.push(model);
            } else {
                console.error(`    Status: FAILED`);
                console.error(`    Error: ${errMsg}`);
                failedModels.push({ ...model, error: errMsg });
            }
        }
        console.error('');
    }

    console.log(`\n=== Results Summary ===`);
    console.log(`\nFree Models (${freeModels.length}):`);
    if (freeModels.length === 0) {
        console.log('  None found.');
    } else {
        freeModels.forEach(m => console.log(`  - ${m.id} (${m.name})`));
    }

    console.log(`\nPaid Models (Requires Subscription) (${paidModels.length}):`);
    if (paidModels.length === 0) {
        console.log('  None found.');
    } else {
        paidModels.forEach(m => console.log(`  - ${m.id} (${m.name})`));
    }

    if (failedModels.length > 0) {
        console.log(`\nFailed Models with Other Errors (${failedModels.length}):`);
        failedModels.forEach(m => console.log(`  - ${m.id} (${m.name}): ${m.error}`));
    }

    const removedIds = CHANGED_MODELS.mistral.removed;
    console.error(`\n--- [removed-model] Checking ${removedIds.length} models removed from data.json ---\n`);
    const removedResults: { id: string; status: string; error?: string }[] = [];
    for (const id of removedIds) {
        console.error(`[>] [removed-model] Testing Model: ${id}`);
        try {
            const start = Date.now();
            const res = await mistral.chat({
                model: id,
                messages: [{ role: 'user', content: 'Say "OK"' }],
                max_tokens: 5
            });
            const duration = Date.now() - start;
            console.error(`    Status: SUCCESS (${duration}ms)`);
            console.error(`    Response: "${res.choices[0].message.content.trim()}"`);
            removedResults.push({ id, status: 'STILL-WORKS' });
        } catch (error: any) {
            const errMsg = error.message || '';
            if (errMsg.includes('requires a subscription') || errMsg.includes('403')) {
                console.error(`    Status: PAID (Requires subscription)`);
                removedResults.push({ id, status: 'CONFIRMED-DEAD/PAID', error: errMsg });
            } else {
                console.error(`    Status: FAILED`);
                console.error(`    Error: ${errMsg}`);
                removedResults.push({ id, status: 'CONFIRMED-DEAD', error: errMsg });
            }
        }
        console.error('');
    }
    console.log(`\nRemoved models (still-works vs confirmed-dead) (${removedResults.length}):`);
    if (removedResults.length === 0) {
        console.log('  None removed for this provider.');
    } else {
        removedResults.forEach(r => console.log(`  [${r.status}] ${r.id}${r.error ? ` — ${r.error}` : ''}`));
    }

    console.log(`\n=== Test Completed ===\n`);
}

runMistralSmokeTest().catch(error => {
    console.error('Fatal error during Mistral smoke test:', error);
    process.exit(1);
});
