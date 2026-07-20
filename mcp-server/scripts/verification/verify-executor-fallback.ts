/**
 * Diagnostic: trace exactly which providers/models LLMExecutor.prompt() attempts,
 * in what order, for a subtask-shaped call (mirrors AgenticMiddleware's
 * executeSingleSubtask -> executor.prompt() direct call path, minus the PDF image
 * so we don't force vision-only routing / burn gemini's 15rpm quota).
 */
import { LLMExecutor } from '../../src/utils/LLMExecutor.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

async function main() {
    const registry = ProviderRegistry.getInstance();
    console.log('Available providers:', registry.getAvailableProviders().map(p => p.id).join(', '));

    const executor = new LLMExecutor();

    const origError = console.error;
    const origDebug = console.debug;
    console.error = (...a: any[]) => origError('[captured:error]', ...a);
    console.debug = (...a: any[]) => origError('[captured:debug]', ...a);

    try {
        const res = await executor.prompt(
            [{ role: 'user', content: 'Say "ok" and nothing else.' }],
            undefined as any, // modelOverride -> defaults to 'any'
            { taskType: 'coding', agentic: false }
        );
        console.log('\nSUCCESS. Response id:', res.id, 'model:', (res as any).model);
    } catch (err: any) {
        console.log('\nFAILED:', err.message);
    } finally {
        console.error = origError;
        console.debug = origDebug;
    }
}

main();
