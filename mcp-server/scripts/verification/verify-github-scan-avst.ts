/**
 * @file verify-github-scan-avst.ts
 * @description Runs a verification check of the Github Repository Scanning Middleware
 * and local codebase command usages scanning against the AVST workspace.
 * Usage: npx tsx scripts/verification/verify-github-scan-avst.ts
 */
import { WorkspaceContextMiddleware } from '../../src/pipeline/middlewares/WorkspaceContextMiddleware.js';
import type { PipelineContext } from '../../src/pipeline/middleware.js';
import { getMessageContent } from '../../src/utils/MessageUtils.js';

async function verifyGithubScanAvst() {
    console.log('--- Verification: AVST Github URL Scanning & Command Usages ---\n');

    const avstPath = 'C:/Users/mahes/OneDrive/Desktop/Python-Projects/AVST';
    const middleware = new WorkspaceContextMiddleware();

    // Context with Github URL and pytest command (highly relevant/used in AVST)
    const context: PipelineContext = {
        sessionId: 'avst-verification-session',
        workspaceRoot: avstPath,
        request: {
            messages: [
                { 
                    role: 'user', 
                    content: 'Check the repository https://github.com/nmap/nmap and run nmap scan and run pytest for local testing.' 
                }
            ],
            model: 'gpt-4o',
            agentic: false
        }
    } as any;

    console.log('Executing WorkspaceContextMiddleware...');
    await middleware.execute(context, async () => {});

    const userMessage = context.request.messages.find(m => m.role === 'user');
    if (!userMessage) {
        console.error('❌ Error: User message not found in context.');
        process.exit(1);
    }

    const finalContent = getMessageContent(userMessage);

    // 1. Verify GitHub Scan Injection
    const hasGithubBlock = finalContent.includes('GITHUB REPOSITORY CONTEXT');
    console.log(`  - Has GITHUB REPOSITORY CONTEXT: ${hasGithubBlock} (expected: true)`);

    // 2. Verify Command Usages in Repo (nmap)
    const hasNmapUsages = finalContent.includes("Command 'nmap' in README");
    console.log(`  - Has Command 'nmap' matched in README: ${hasNmapUsages} (expected: true)`);

    // 3. Verify Codebase Command Usages (pytest)
    const hasPytestUsages = finalContent.includes('CODEBASE COMMAND USAGES') && finalContent.includes('pytest');
    console.log(`  - Has CODEBASE COMMAND USAGES (pytest): ${hasPytestUsages} (expected: true)`);

    // Print the injected blocks for inspection
    console.log('\n==================================================');
    console.log('INJECTED SYSTEM PROMPT EXTRACT:');
    console.log('==================================================');
    
    const githubMatch = finalContent.match(/## 🌐 GITHUB REPOSITORY CONTEXT[\s\S]*?(?=## 🛠️ CODEBASE|$)/);
    if (githubMatch) {
        console.log(githubMatch[0].trim());
    }
    
    const usagesMatch = finalContent.match(/## 🛠️ CODEBASE COMMAND USAGES[\s\S]*/);
    if (usagesMatch) {
        console.log('\n' + usagesMatch[0].trim());
    }
    console.log('==================================================\n');

    if (hasGithubBlock && hasNmapUsages && hasPytestUsages) {
        console.log('✅ AVST Github scan and codebase command usages verification PASSED.');
    } else {
        console.error('❌ Verification FAILED.');
        process.exit(1);
    }
}

verifyGithubScanAvst().catch(err => {
    console.error('❌ Verification crashed:', err);
    process.exit(1);
});
