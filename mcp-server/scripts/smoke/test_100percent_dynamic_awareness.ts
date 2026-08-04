import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { DynamicNodeAnalyzer, ScrapingSessionCheckpointManager } from '../../src/tools/browser-action.js';

async function main() {
    console.log('🚀 [100% Dynamic Structural Awareness Test (Zero Hardcoded Domain Strings)] Spawning Chrome DevTools MCP...');

    const transport = new StdioClientTransport({
        command: 'npx',
        args: [
            '-y',
            'chrome-devtools-mcp',
            '--chrome-arg=--no-sandbox',
            '--allow-unrestricted-paths'
        ]
    });

    const client = new Client({
        name: 'dynamic-awareness-test',
        version: '1.0.0'
    }, {
        capabilities: {}
    });

    await client.connect(transport);
    console.log('✅ Connected to Chrome DevTools MCP server.');

    const targetUrl = 'https://www.sofascore.com/football/match/coritiba-palmeiras/nOsHO#id:15237982';

    console.log(`\n==================================================`);
    console.log(`🌐 STEP 1: Navigating Chrome DevTools to ${targetUrl}...`);
    await client.callTool({
        name: 'navigate_page',
        arguments: { url: targetUrl }
    });

    console.log(`⏱️ Waiting 7s for dynamic JS hydration...`);
    await new Promise(r => setTimeout(r, 7000));

    // STEP 2: 100% Structural Interactive Node Discovery (Zero Hardcoding)
    const discoveredNodes = await DynamicNodeAnalyzer.discoverInteractiveNodes(client);
    console.log(`\n🧠 STEP 2: Discovered ${discoveredNodes.length} Interactive Nodes Structurally:`);
    for (const node of discoveredNodes) {
        console.log(`   [Index ${node.index}] Tag: <${node.tag}> | Role: "${node.role}" | Label: "${node.label}"`);
    }

    // Save Checkpoint
    const outputDir = path.join(process.cwd(), 'data', 'scrapes');
    const sessionId = 'dynamic_structural_awareness_v1';
    const cpPath = await ScrapingSessionCheckpointManager.saveCheckpoint(outputDir, {
        sessionId,
        targetUrl,
        domainContext: 'Structural Web Analysis',
        status: 'NODES_DISCOVERED',
        currentPage: 1,
        visitedUrls: [targetUrl],
        pendingUrlQueue: discoveredNodes.map(n => n.href).filter((h): h is string => Boolean(h)),
        domStateFingerprint: '',
        accumulatedRecords: [],
        deepRecords: [],
        discoveredNodes,
        discoveredSections: [],
        lastUpdated: new Date().toISOString()
    });

    console.log(`\n💾 Structural Checkpoint Saved:`);
    console.log(`   file:///${cpPath.replace(/\\/g, '/')}`);

    console.log('\n🏁 100% Dynamic Structural Awareness Test Complete.');
    await client.close();
}

main().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
