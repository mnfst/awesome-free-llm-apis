/**
 * @file verify-agents-injection.ts
 * @description Validates that the getIntelligentSystemPrompt dynamically reads AGENTS.md
 * from the target workspace (AVST) and injects contextually relevant sections.
 * Usage: npx tsx scripts/verification/verify-agents-injection.ts
 */
import { getIntelligentSystemPrompt } from '../../src/pipeline/middlewares/prompts.js';
import path from 'path';

async function verifyAgentsInjection() {
    console.log('--- Verification: Dynamic AGENTS.md Injection ---\n');

    const avstPath = 'C:/Users/mahes/OneDrive/Desktop/Python-Projects/AVST';

    // Test Case 1: Query relating to Git / commit workflow
    console.log('--------------------------------------------------');
    console.log('[1/2] Query: "Commit changes to the branch and push"');
    const gitPrompt = await getIntelligentSystemPrompt({
        context: 'Commit changes to the branch and push',
        isSubtask: true,
        workspaceRoot: avstPath
    });

    const hasGuidelines = gitPrompt.includes('TARGET PROJECT GUIDELINES');
    const hasGitWorkflow = gitPrompt.includes('Git Workflow') || gitPrompt.includes('git');
    
    console.log(`  - Has TARGET PROJECT GUIDELINES block: ${hasGuidelines} (expected: true)`);
    console.log(`  - Has Git Workflow section matched: ${hasGitWorkflow} (expected: true)`);
    console.log(`  - Char length: ${gitPrompt.length}`);
    
    // Extract and print the guidelines block
    const gitMatch = gitPrompt.match(/## 📋 TARGET PROJECT GUIDELINES\n<target_project_guidelines_isolation_gate>([\s\S]*?)<\/target_project_guidelines_isolation_gate>/);
    if (gitMatch) {
        console.log('\n--- INJECTED CONTEXT ---');
        console.log(gitMatch[1].trim());
        console.log('------------------------\n');
    }

    // Test Case 2: Query relating to running tests or pytest
    console.log('--------------------------------------------------');
    console.log('[2/2] Query: "Run pytest unit tests in ctf-katana"');
    const testPrompt = await getIntelligentSystemPrompt({
        context: 'Run pytest unit tests in ctf-katana',
        isSubtask: true,
        workspaceRoot: avstPath
    });

    const hasTestGuidelines = testPrompt.includes('TARGET PROJECT GUIDELINES');
    const hasTestingSection = testPrompt.includes('Testing') || testPrompt.includes('test') || testPrompt.includes('pytest');
    
    console.log(`  - Has TARGET PROJECT GUIDELINES block: ${hasTestGuidelines} (expected: true)`);
    console.log(`  - Has Testing section matched: ${hasTestingSection} (expected: true)`);
    console.log(`  - Char length: ${testPrompt.length}`);

    // Extract and print the guidelines block
    const testMatch = testPrompt.match(/## 📋 TARGET PROJECT GUIDELINES\n<target_project_guidelines_isolation_gate>([\s\S]*?)<\/target_project_guidelines_isolation_gate>/);
    if (testMatch) {
        console.log('\n--- INJECTED CONTEXT ---');
        console.log(testMatch[1].trim());
        console.log('------------------------\n');
    }

    // Summary
    const pass = hasGuidelines && hasGitWorkflow && hasTestGuidelines && hasTestingSection;
    if (pass) {
        console.log('✅ All AGENTS.md dynamic injection checks PASSED.');
    } else {
        console.error('❌ One or more checks FAILED. Review output above.');
        process.exit(1);
    }
}

verifyAgentsInjection().catch(err => {
    console.error('❌ Verification crashed:', err.message);
    process.exit(1);
});
