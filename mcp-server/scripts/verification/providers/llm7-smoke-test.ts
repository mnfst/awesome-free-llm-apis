/**
 * @file llm7-smoke-test.ts
 * @description Verifies all models currently configured in the LLM7 provider, plus candidate
 * low-cost replacement models from the live https://api.llm7.io/v1/models catalog, and reports
 * which succeed/fail. Usage: tsx scripts/verification/providers/llm7-smoke-test.ts
 */
import 'dotenv/config';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import { LLM7Provider } from '../../../src/providers/llm7.js';

// Cheapest candidates from the live catalog not currently in LLM7Provider.models,
// considered as replacements for dead entries (qwen3-235b, devstral-small-2:24b).
const CANDIDATE_MODELS: { id: string; name: string }[] = [
    { id: 'gpt-oss:20b', name: 'GPT-OSS 20B (candidate)' },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna (Vision candidate)' },
];

async function runLLM7SmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const llm7 = registry.getProvider('llm7') as LLM7Provider;

    if (!llm7) {
        console.error('LLM7 provider not found in registry.');
        process.exit(1);
    }

    if (!llm7.isAvailable()) {
        console.error('LLM7 provider is not available (check LLM7_API_KEY in your env).');
        process.exit(1);
    }

    const modelsToTest = [...llm7.models, ...CANDIDATE_MODELS];

    console.error(`\n=== LLM7 Model Smoke Test ===`);
    console.error(`Testing ${modelsToTest.length} models (${llm7.models.length} configured + ${CANDIDATE_MODELS.length} candidates)...\n`);

    const okModels: { id: string; name: string; durationMs: number }[] = [];
    const failedModels: { id: string; name: string; error: string }[] = [];

    for (const model of modelsToTest) {
        console.error(`[>] Testing Model: ${model.id} (${model.name})`);
        try {
            const start = Date.now();
            const res = await llm7.chat({
                model: model.id,
                messages: [{ role: 'user', content: 'Say "OK"' }],
                max_tokens: 5
            });
            const duration = Date.now() - start;
            console.error(`    Status: SUCCESS (${duration}ms)`);
            console.error(`    Response: "${res.choices[0].message.content.trim()}"`);
            okModels.push({ id: model.id, name: model.name, durationMs: duration });
        } catch (error: any) {
            const errMsg = error.message || String(error);
            console.error(`    Status: FAILED`);
            console.error(`    Error: ${errMsg}`);
            failedModels.push({ id: model.id, name: model.name, error: errMsg });
        }
        console.error('');
    }

    console.log(`\n=== Results Summary ===`);
    console.log(`\nWorking Models (${okModels.length}):`);
    if (okModels.length === 0) {
        console.log('  None found.');
    } else {
        okModels.forEach(m => console.log(`  - ${m.id} (${m.name}) [${m.durationMs}ms]`));
    }

    console.log(`\nFailed Models (${failedModels.length}):`);
    if (failedModels.length === 0) {
        console.log('  None found.');
    } else {
        failedModels.forEach(m => console.log(`  - ${m.id} (${m.name}): ${m.error}`));
    }
    console.log(`\n=== Test Completed ===\n`);
}

runLLM7SmokeTest().catch(error => {
    console.error('Fatal error during LLM7 smoke test:', error);
    process.exit(1);
});
