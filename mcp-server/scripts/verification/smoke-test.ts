/**
 * @file smoke-test.ts
 * @description Verifies that configured LLM providers are reachable and responding.
 * Usage: tsx scripts/verification/smoke-test.ts
 */
import { ProviderRegistry } from '../../src/providers/registry.js';

async function runSmokeTest() {
    const registry = ProviderRegistry.getInstance();
    const providers = registry.getAllProviders();

    // In a real environment, you'd want to check p.isAvailable()
    // but for this test, we might want to see which ones are missing keys too.
    const availableProviders = providers.filter(p => p.isAvailable());

    console.error(`\n=== MCP Provider Smoke Test ===`);
    console.error(`Found ${providers.length} total providers.`);
    console.error(`Available providers: ${availableProviders.length > 0 ? availableProviders.map(p => p.id).join(', ') : 'NONE (set API keys in .env)'}`);

    if (availableProviders.length === 0) {
        console.error('\nTip: Create a .env file in the mcp-server directory with your API keys.');
        process.exit(0);
    }

    for (const provider of availableProviders) {
        // Preference for gemini-2.5-flash if it exists, otherwise first model
        let model = provider.models[0];
        if (provider.id === 'gemini') {
            const preferred = provider.models.find(m => m.id === 'gemini-3.1-flash-lite');
            if (preferred) model = preferred;
        }

        if (!model) {
            console.error(`\n[-] Provider: ${provider.name} - No models defined.`);
            continue;
        }

        console.error(`\n[>] Testing Provider: ${provider.name} (${provider.id})`);
        console.error(`    Model: ${model.id}`);

        try {
            // Set a 30s timeout for the chat call
            const start = Date.now();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timed out after 30s')), 30000)
            );

            const chatPromise = provider.chat({
                model: model.id,
                messages: [{ role: 'user', content: 'Say "OK"' }],
                max_tokens: 1
            });

            await Promise.race([chatPromise, timeoutPromise]);
            const duration = Date.now() - start;

            console.error(`    Status: SUCCESS (${duration}ms)`);
        } catch (error: any) {
            console.error(`    Status: FAILED`);
            console.error(`    Error: ${error.message}`);
        }
    }

    console.error(`\n=== Test Completed ===\n`);
}

runSmokeTest().catch(error => {
    console.error('Fatal error during smoke test:', error);
    process.exit(1);
});
