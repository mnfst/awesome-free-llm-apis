import { listAvailableFreeModels } from '../../src/tools/list-models.js';
import { getTokenStats } from '../../src/tools/get-token-stats.js';

async function runProvidersSmoke() {
  console.error('=== Providers & LLM Token Stats Smoke Test ===\n');

  // 1. List models
  console.error('1. Available models inventory:');
  const modelsRes = await listAvailableFreeModels({});
  console.error(`   ${modelsRes.summary}`);

  // 2. Token stats
  console.error('2. Provider quotas and telemetry:');
  const statsRes = await getTokenStats();
  console.error(`   Tracked providers: ${statsRes.stats.length}`);
  console.error('   Server lifetime requests:', statsRes.serverTotals.lifetimeRequests);

  console.error('\nProviders & LLM Smoke Test Complete!');
}

runProvidersSmoke().catch(console.error);
