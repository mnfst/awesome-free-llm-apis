import { quantumTool, PresetCircuitType } from '../../src/tools/quantum-tool.js';

async function runQuantumBenchmarks() {
  console.error('=== Quantum Reasoning Circuits Telemetry & Benchmark Smoke Test ===\n');

  const circuits: PresetCircuitType[] = [
    'superposition_exploration',
    'adversarial_debate',
    'consensus_alignment',
    'grover_amplification',
    'entangled_verification'
  ];

  for (const preset of circuits) {
    const sessionId = `smoke-bench-${preset}-${Date.now()}`;
    console.error(`[Preset: ${preset}]`);

    const setupRes = await quantumTool({
      action: 'setup',
      sessionId,
      presetCircuit: preset
    });

    if (!setupRes.success) {
      console.error(`  Setup failed for ${preset}:`, setupRes.error);
      continue;
    }

    console.error(`  - Branches initialized: ${setupRes.state.branches.length}`);
    console.error(`  - Initial gates: ${setupRes.state.gates.length}`);

    let stepCount = 0;
    while (!setupRes.state.isComplete && stepCount < 4) {
      const stepRes = await quantumTool({ action: 'step', sessionId });
      if (!stepRes.success) break;
      stepCount++;
    }

    const stateRes = await quantumTool({ action: 'get_state', sessionId });
    const telemetry = stateRes.telemetry;

    console.error(`  - Completed steps: ${stepCount}`);
    console.error(`  - Circuit Depth: ${telemetry?.quantumStateMetrics?.circuitDepth}`);
    console.error(`  - Active Gates: ${telemetry?.quantumStateMetrics?.activeGateCount}`);
    console.error(`  - Confidence Divergence (variance): ${telemetry?.quantumStateMetrics?.confidenceDivergence}`);
    console.error(`  - Entropy Score: ${telemetry?.quantumStateMetrics?.entropyScore}`);
    console.error(`  - Resolved Branches: ${telemetry?.quantumStateMetrics?.resolvedBranchesCount}`);
    console.error(`  - Superposition Branches: ${telemetry?.quantumStateMetrics?.superpositionBranchesCount}`);
    console.error(`  - Total Duration: ${telemetry?.executionMetrics?.totalDurationMs}ms\n`);
  }

  console.error('Quantum Reasoning Benchmark Complete!');
}

runQuantumBenchmarks().catch(console.error);

