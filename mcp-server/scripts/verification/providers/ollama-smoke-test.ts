/**
 * @file ollama-smoke-test.ts
 * @description Verifies all models defined in the Ollama Cloud provider and identifies which are free.
 * Usage: tsx scripts/verification/providers/ollama-smoke-test.ts
 */
import 'dotenv/config';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import { OllamaCloudProvider } from '../../../src/providers/ollama-cloud.js';
import { CHANGED_MODELS } from './_changed-models.js';

async function runOllamaSmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const ollama = registry.getProvider('ollama-cloud') as OllamaCloudProvider;

    if (!ollama) {
        console.error('Ollama Cloud provider not found in registry.');
        process.exit(1);
    }

    if (!ollama.isAvailable()) {
        console.error('Ollama Cloud provider is not available (check OLLAMA_API_KEY in your env).');
        process.exit(1);
    }

    console.error(`\n=== Ollama Cloud Model Smoke Test ===`);
    console.error(`Testing ${ollama.models.length} models...\n`);

    const freeModels: { id: string; name: string }[] = [];
    const paidModels: { id: string; name: string }[] = [];
    const failedModels: { id: string; name: string; error: string }[] = [];

    for (const model of ollama.models) {
        console.error(`[>] Testing Model: ${model.id} (${model.name})`);
        try {
            const start = Date.now();
            const res = await ollama.chat({
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

    const removedIds = CHANGED_MODELS['ollama-cloud'].removed;
    console.error(`\n--- [removed-model] Checking ${removedIds.length} models removed from data.json ---\n`);
    const removedResults: { id: string; status: string; error?: string }[] = [];
    for (const id of removedIds) {
        console.error(`[>] [removed-model] Testing Model: ${id}`);
        try {
            const start = Date.now();
            const res = await ollama.chat({
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

runOllamaSmokeTest().catch(error => {
    console.error('Fatal error during Ollama Cloud smoke test:', error);
    process.exit(1);
});
