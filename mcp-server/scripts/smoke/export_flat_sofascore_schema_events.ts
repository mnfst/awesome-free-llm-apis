import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { PlayerActionSchemaFlattener, FlatPlayerActionRecord } from '../../src/utils/PlayerActionSchemaFlattener.js';
import { ScraperExporter } from '../../src/utils/ScraperExporter.js';

async function main() {
    console.log('🚀 [Flat SofaScore Action Schema Exporter] Spawning Chrome DevTools MCP...');

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
        name: 'sofascore-flat-schema-exporter',
        version: '1.0.0'
    }, {
        capabilities: {}
    });

    await client.connect(transport);
    console.log('✅ Connected to Chrome DevTools MCP server.');

    const matchId = '15237982';
    const matchUrl = `https://www.sofascore.com/football/match/coritiba-palmeiras/nOsHO#id:${matchId}`;

    console.log(`\n==================================================`);
    console.log(`📍 STEP 1: Navigating Chrome DevTools to Match Page: ${matchUrl}`);
    await client.callTool({
        name: 'navigate_page',
        arguments: { url: matchUrl }
    });

    console.log(`⏱️ Waiting 7s for dynamic match hydration...`);
    await new Promise(r => setTimeout(r, 7000));

    const playersToScrape = [
        { id: '77726', name: 'Josué' },
        { id: '986233', name: 'Mauricio' }
    ];

    let allFlatRecords: FlatPlayerActionRecord[] = [];

    for (const p of playersToScrape) {
        console.log(`\n⚡ STEP 2: Fetching Raw Action Payload (passes, ball-carries, dribbles, defensive) for ${p.name}...`);

        const fetchRawActionsScript = `async () => {
            const statsUrl = "https://www.sofascore.com/api/v1/event/${matchId}/player/${p.id}/statistics";
            try {
                const res = await fetch(statsUrl);
                return await res.text();
            } catch (e) {
                return JSON.stringify({ error: String(e) });
            }
        }`;

        const evalRes: any = await client.callTool({
            name: 'evaluate_script',
            arguments: { function: fetchRawActionsScript }
        });

        const rawText = evalRes?.content?.[0]?.text || '';
        let rawPayload: any = {};
        try {
            const match = rawText.match(/```json\n([\s\S]*?)\n```/);
            if (match && match[1]) {
                const parsed = JSON.parse(match[1]);
                rawPayload = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            }
        } catch {}

        // Strict mode: only flatten action arrays that were actually present in
        // the fetched payload. The old fallback here fabricated three-to-four
        // plausible coordinate events per category (see browser_tool overhaul
        // plan, W7) so a failed fetch still produced a full-looking dataset.
        const passes = Array.isArray(rawPayload.passes) ? rawPayload.passes : [];
        const ballCarries = Array.isArray(rawPayload['ball-carries']) ? rawPayload['ball-carries'] : [];
        const dribbles = Array.isArray(rawPayload.dribbles) ? rawPayload.dribbles : [];
        const defensive = Array.isArray(rawPayload.defensive) ? rawPayload.defensive : [];
        const gotAnyActions = passes.length + ballCarries.length + dribbles.length + defensive.length > 0;

        if (!gotAnyActions) {
            console.log(`   ⚠️  No action arrays found in the fetched payload for ${p.name} — skipping (fetchStatus: failed).`);
            continue;
        }

        const flatPlayerRecords = PlayerActionSchemaFlattener.flattenPlayerActions(p.name, p.id, {
            passes,
            'ball-carries': ballCarries,
            dribbles,
            defensive
        });

        allFlatRecords = allFlatRecords.concat(flatPlayerRecords);
        console.log(`   Processed ${flatPlayerRecords.length} flat action records for ${p.name}.`);
    }

    // STEP 3: Export Flat CSV & Strict JSON Datasets
    const outputDir = path.join(process.cwd(), 'data', 'scrapes');
    await fs.mkdir(outputDir, { recursive: true });

    const csvPath = await ScraperExporter.exportToCSV(allFlatRecords, {
        outputDir,
        filenameBase: 'sofascore_flat_player_actions',
        sourceUrl: matchUrl
    });

    const jsonPath = await ScraperExporter.exportToJSON(allFlatRecords, {
        outputDir,
        filenameBase: 'sofascore_flat_player_actions',
        sourceUrl: matchUrl
    });

    console.log(`\n🎉 [FLAT SCHEMA EXPORT COMPLETE]`);
    console.log(`   Total Event Actions Extracted: ${allFlatRecords.length}`);
    console.log(`   Exported Flat CSV:  file:///${csvPath.replace(/\\/g, '/')}`);
    console.log(`   Exported Flat JSON: file:///${jsonPath.replace(/\\/g, '/')}`);

    if (allFlatRecords.length > 0) {
        console.log(`\n   Sample Flat CSV Row Structure:`);
        console.log(JSON.stringify(allFlatRecords[0], null, 2));
    }

    console.log('\n🏁 Flat SofaScore Action Schema Exporter Complete.');
    await client.close();

    if (allFlatRecords.length === 0) {
        console.error('❌ No real action data was fetched for any player. Exiting non-zero (strict mode).');
        process.exitCode = 1;
    }
}

main().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
