/**
 * @file github-models-smoke-test.ts
 * @description Verifies all models defined in the GitHub Models provider.
 * Usage: tsx scripts/verification/providers/github-models-smoke-test.ts [model-id]
 */
import 'dotenv/config';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import { GitHubModelsProvider } from '../../../src/providers/github-models.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runGitHubModelsSmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const githubModels = registry.getProvider('github-models') as GitHubModelsProvider;

    if (!githubModels) {
        console.error('GitHub Models provider not found in registry.');
        process.exit(1);
    }

    if (!githubModels.isAvailable()) {
        console.error('GitHub Models provider is not available (check GITHUB_TOKEN in your env).');
        process.exit(1);
    }

    const targetModelId = process.argv[2];
    const modelsToTest = targetModelId 
        ? githubModels.models.filter(m => m.id === targetModelId)
        : githubModels.models;

    if (targetModelId && modelsToTest.length === 0) {
        console.error(`Model "${targetModelId}" not found in GitHub Models provider.`);
        process.exit(1);
    }

    console.error(`\n=== GitHub Models Smoke Test ===`);
    console.error(`Testing ${modelsToTest.length} models with rate limit delay...\n`);

    const successfulModels: { id: string; name: string }[] = [];
    const failedModels: { id: string; name: string; error: string }[] = [];

    // 15 RPM means one request every 4 seconds. We wait 4200ms to be safe.
    const delayMs = 4200;

    for (let i = 0; i < modelsToTest.length; i++) {
        const model = modelsToTest[i];
        
        if (i > 0) {
            console.error(`Waiting ${delayMs}ms to respect rate limit (15 RPM)...`);
            await sleep(delayMs);
        }

        console.error(`[>] Testing Model: ${model.id} (${model.name})`);
        try {
            const start = Date.now();
            const res = await githubModels.chat({
                model: model.id,
                messages: [{ role: 'user', content: 'Say "OK"' }],
                max_tokens: 5
            });
            const duration = Date.now() - start;
            console.error(`    Status: SUCCESS (${duration}ms)`);
            console.error(`    Response: "${res.choices[0].message.content.trim()}"`);
            successfulModels.push(model);
        } catch (error: any) {
            const errMsg = error.message || '';
            console.error(`    Status: FAILED`);
            console.error(`    Error: ${errMsg}`);
            failedModels.push({ ...model, error: errMsg });
        }
        console.error('');
    }

    console.log(`\n=== Results Summary ===`);
    console.log(`\nAvailable/Successful Models (${successfulModels.length}):`);
    if (successfulModels.length === 0) {
        console.log('  None found.');
    } else {
        successfulModels.forEach(m => console.log(`  - ${m.id} (${m.name})`));
    }

    if (failedModels.length > 0) {
        console.log(`\nFailed Models (${failedModels.length}):`);
        failedModels.forEach(m => console.log(`  - ${m.id} (${m.name}): ${m.error}`));
    }
    console.log(`\n=== Test Completed ===\n`);
}

runGitHubModelsSmokeTest().catch(error => {
    console.error('Fatal error during GitHub Models smoke test:', error);
    process.exit(1);
});
