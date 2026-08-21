import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quantumTool } from '../src/tools/quantum-tool.js';
import { quantumCompressWithStats } from '../src/utils/quantum-compression.js';

vi.mock('../src/tools/use-free-llm.js', () => ({
  useFreeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Synthesized quantum analysis result across branches.' } }],
  }),
}));

vi.mock('../src/utils/ChatLogger.js', () => ({
  logToolCall: vi.fn().mockResolvedValue(undefined),
}));

describe('Quantum Reasoning Circuit Topologies & Metrics Telemetry', () => {
  let sessionId: string;
  beforeEach(() => {
    sessionId = `metrics-test-${Math.random()}`;
  });

  describe('quantumCompressWithStats', () => {
    it('returns rich compression statistics with token estimates and density', () => {
      const longText = 'We need to analyze the microservices. First, database connectivity is critical. Um, basically, so I think that maybe we should check the network latency. Finally, all integration endpoints must be tested.';
      const stats = quantumCompressWithStats(longText, 0.4);

      expect(stats.compressedText).toBeDefined();
      expect(stats.rawLength).toBeGreaterThan(stats.compressedLength);
      expect(stats.rawTokensEstimate).toBeGreaterThan(stats.compressedTokensEstimate);
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.symbolDensity).toBeGreaterThan(0);
    });
  });

  describe('Preset Reasoning Circuit Topologies', () => {
    it('initializes adversarial_debate preset with opposing branches and refutation gates', async () => {
      const result = await quantumTool({
        action: 'setup',
        sessionId,
        presetCircuit: 'adversarial_debate'
      });

      expect(result.success).toBe(true);
      expect(result.state.branches.length).toBeGreaterThanOrEqual(2);
      expect(result.state.gates.length).toBeGreaterThan(0);
      expect(result.state.gates.some((g: any) => g.gate === 'CNOT')).toBe(true);
    });

    it('initializes superposition_exploration preset with Hadamard gates across all qubits', async () => {
      const result = await quantumTool({
        action: 'setup',
        sessionId,
        presetCircuit: 'superposition_exploration',
        numBranches: 4
      });

      expect(result.success).toBe(true);
      expect(result.state.branches).toHaveLength(4);
      expect(result.state.gates.filter((g: any) => g.gate === 'H')).toHaveLength(4);
    });

    it('initializes consensus_alignment preset with converging RY rotations and measurement', async () => {
      const result = await quantumTool({
        action: 'setup',
        sessionId,
        presetCircuit: 'consensus_alignment'
      });

      expect(result.success).toBe(true);
      expect(result.state.gates.some((g: any) => g.gate === 'RY')).toBe(true);
      expect(result.state.gates.some((g: any) => g.gate === 'MEASURE')).toBe(true);
    });
  });

  describe('Execution & Token Efficiency Metrics Tracking', () => {
    it('calculates confidence divergence, entropy, and execution metrics on step and get_state', async () => {
      await quantumTool({
        action: 'setup',
        sessionId,
        presetCircuit: 'adversarial_debate'
      });

      const stepRes = await quantumTool({ action: 'step', sessionId });
      expect(stepRes.success).toBe(true);
      expect(stepRes.telemetry).toBeDefined();
      expect(stepRes.telemetry.executionMetrics.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(stepRes.telemetry.quantumStateMetrics.circuitDepth).toBeGreaterThanOrEqual(1);
      expect(stepRes.telemetry.quantumStateMetrics.confidenceDivergence).toBeGreaterThanOrEqual(0);
      expect(typeof stepRes.telemetry.quantumStateMetrics.entropyScore).toBe('number');
    });

    it('returns tokenEfficiencyMatrix on analyze calls', async () => {
      await quantumTool({
        action: 'setup',
        sessionId,
        presetCircuit: 'superposition_exploration',
        numBranches: 3
      });

      const analyzeRes = await quantumTool({
        action: 'analyze',
        sessionId,
        query: 'Compare these architectural hypotheses and select the optimal design',
        temperature: 0.6
      });

      expect(analyzeRes.success).toBe(true);
      expect(analyzeRes.telemetry).toBeDefined();
      expect(analyzeRes.telemetry.tokenEfficiencyMatrix).toBeDefined();
      expect(analyzeRes.telemetry.tokenEfficiencyMatrix.rawPromptTokens).toBeGreaterThan(0);
      expect(analyzeRes.telemetry.tokenEfficiencyMatrix.compressedPromptTokens).toBeGreaterThan(0);
      expect(analyzeRes.telemetry.tokenEfficiencyMatrix.tokensPerBranch).toBeGreaterThan(0);
      expect(analyzeRes.telemetry.executionMetrics.llmInferenceMs).toBeDefined();
    });
  });
});
