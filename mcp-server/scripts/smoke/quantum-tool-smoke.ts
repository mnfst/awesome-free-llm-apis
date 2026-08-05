import { quantumTool } from '../../src/tools/quantum-tool.js';

async function main() {
  const sessionId = `quantum-smoke-${Date.now()}`;

  console.log('--- setup ---');
  console.log(await quantumTool({ action: 'setup', sessionId, numBranches: 2, personas: ['Optimist', 'Skeptic'] }));

  console.log('--- modify: H on both branches at column 0 ---');
  console.log(await quantumTool({
    action: 'modify', sessionId,
    gates: [{ qubit: 0, column: 0, gate: 'H' }, { qubit: 1, column: 0, gate: 'H' }],
  }));

  console.log('--- modify: RY(1.2) on branch 0 at column 1 ---');
  console.log(await quantumTool({
    action: 'modify', sessionId,
    gates: [{ qubit: 0, column: 1, gate: 'RY', param: 1.2 }],
  }));

  console.log('--- modify: CNOT(0,1) at column 2 ---');
  console.log(await quantumTool({
    action: 'modify', sessionId,
    gates: [{ qubit: 0, column: 2, gate: 'CNOT', target: 1 }],
  }));

  console.log('--- step x3 ---');
  console.log(JSON.stringify(await quantumTool({ action: 'step', sessionId }), null, 2));
  console.log(JSON.stringify(await quantumTool({ action: 'step', sessionId }), null, 2));
  console.log(JSON.stringify(await quantumTool({ action: 'step', sessionId }), null, 2));

  console.log('--- get_state ---');
  console.log(JSON.stringify(await quantumTool({ action: 'get_state', sessionId }), null, 2));

  console.log('--- reset ---');
  console.log(JSON.stringify(await quantumTool({ action: 'reset', sessionId }), null, 2));

  console.log('--- error path: step on unknown session ---');
  console.log(await quantumTool({ action: 'step', sessionId: 'does-not-exist' }));
}

main().catch(err => { console.error('SMOKE TEST FAILED:', err); process.exit(1); });
