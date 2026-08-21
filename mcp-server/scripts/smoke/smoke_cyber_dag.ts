import { cyberTool } from '../../src/tools/cyber-tool.js';

async function runCyberDagSmoke() {
  console.error('=== Cyber Tool & DAG Decision Graph Smoke Test ===\n');

  // 1. List catalog tools
  console.error('1. Listing cyber tool catalog:');
  const catalogRes = await cyberTool({ action: 'list_tools' });
  console.error(`   Found ${catalogRes.tools?.length || 0} tools in catalog.`);

  // 2. Decision graph save and load
  console.error('2. Saving and loading decision graph node:');
  const sessionId = `smoke-ctf-${Date.now()}`;
  const saveRes = await cyberTool({
    action: 'save_graph',
    sessionId,
    graphNode: {
      id: 'node-1',
      label: 'Initial recon',
      type: 'action'
    }
  });
  console.error('   Save graph result:', saveRes.success ? 'OK' : saveRes.error);

  const loadRes = await cyberTool({ action: 'load_graph', sessionId });
  console.error('   Load graph result:', loadRes.success ? 'OK' : loadRes.error);

  // 3. Tool memory round-trip
  console.error('3. Writing and reading tool memory:');
  const memWrite = await cyberTool({
    action: 'tool_memory',
    memoryOp: 'write',
    toolName: 'ffuf',
    note: 'Tested fuzzing endpoint parameters with wordlist.'
  });
  console.error('   Tool memory write:', memWrite.success ? 'OK' : memWrite.error);

  const memRead = await cyberTool({
    action: 'tool_memory',
    memoryOp: 'read',
    toolName: 'ffuf'
  });
  console.error('   Tool memory read:', memRead.success ? 'OK' : memRead.error);

  console.error('\nCyber Tool Smoke Test Complete!');
}

runCyberDagSmoke().catch(console.error);

