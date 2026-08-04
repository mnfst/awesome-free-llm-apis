/**
 * @file gemini-smoke-test.ts
 * @description Verifies all models defined in the Gemini provider.
 * Usage: tsx scripts/verification/providers/gemini-smoke-test.ts
 */
import 'dotenv/config';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import { GeminiProvider } from '../../../src/providers/gemini.js';
import { CHANGED_MODELS } from './_changed-models.js';

async function runGeminiSmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const gemini = registry.getProvider('gemini') as GeminiProvider;

    if (!gemini) {
        console.error('Gemini provider not found in registry.');
        process.exit(1);
    }

    if (!gemini.isAvailable()) {
        console.error('Gemini provider is not available (check GEMINI_API_KEY).');
        process.exit(1);
    }

    console.error(`\n=== Gemini Model Smoke Test ===`);
    console.error(`Testing ${gemini.models.length} models...\n`);

    for (const model of gemini.models) {
        console.error(`[>] Testing Model: ${model.id} (${model.name})`);
        try {
            const start = Date.now();
            const res = await gemini.chat({
                model: model.id,
                messages: [{ role: 'user', content: 'Say "OK"' }],
                max_tokens: 5
            });
            const duration = Date.now() - start;
            console.error(`    Status: SUCCESS (${duration}ms)`);
            console.error(`    Response: "${res.choices[0].message.content.trim()}"`);
        } catch (error: any) {
            console.error(`    Status: FAILED`);
            console.error(`    Error: ${error.message}`);
        }
        console.error('');
    }

    const existingIds = new Set(gemini.models.map(m => m.id));
    const newIds = CHANGED_MODELS.gemini.added.filter(id => !existingIds.has(id));
    if (newIds.length > 0) {
        console.error(`--- [added-model] Checking ${newIds.length} models added by upstream merge (not yet in provider list) ---\n`);
        for (const id of newIds) {
            console.error(`[>] [added-model] Testing Model: ${id}`);
            try {
                const start = Date.now();
                const res = await gemini.chat({
                    model: id,
                    messages: [{ role: 'user', content: 'Say "OK"' }],
                    max_tokens: 5
                });
                const duration = Date.now() - start;
                console.error(`    Status: SUCCESS (${duration}ms)`);
                console.error(`    Response: "${res.choices[0].message.content.trim()}"`);
            } catch (error: any) {
                console.error(`    Status: FAILED`);
                console.error(`    Error: ${error.message}`);
            }
            console.error('');
        }
    }

    console.error(`=== Test Completed ===\n`);
}

runGeminiSmokeTest().catch(error => {
    console.error('Fatal error during Gemini smoke test:', error);
    process.exit(1);
});
