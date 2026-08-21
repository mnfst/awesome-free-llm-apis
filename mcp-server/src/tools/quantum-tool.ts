import { logToolCall } from '../utils/ChatLogger.js';
import { quantumCompress, quantumCompressWithStats, QuantumCompressionStats } from '../utils/quantum-compression.js';
import { TaskType } from '../pipeline/middleware.js';

export type GateName = 'H' | 'X' | 'Y' | 'Z' | 'RY' | 'RZ' | 'CNOT' | 'CZ' | 'SWAP' | 'MEASURE' | 'BARRIER';

export type PresetCircuitType = 'superposition_exploration' | 'adversarial_debate' | 'consensus_alignment' | 'grover_amplification' | 'entangled_verification';

export interface GateOp {
  qubit: number;
  column: number;
  gate: GateName;
  target?: number; // second qubit for CNOT/CZ/SWAP
  param?: number;  // angle (radians) for RY/RZ
}

export interface QuantumBranch {
  id: string;
  persona: string;
  stance: 'for' | 'against' | 'neutral';
  /** Treated as a measurement probability (prob of stance 'for'/'1'), 0..1. */
  confidence: number;
  evidence: string[];
}

export interface QuantumCircuitTelemetry {
  executionMetrics: {
    circuitSetupMs?: number;
    gateExecutionMs?: number;
    llmInferenceMs?: number;
    totalDurationMs: number;
  };
  tokenEfficiencyMatrix?: {
    rawPromptTokens: number;
    compressedPromptTokens: number;
    tokenSavingsPct: number;
    symbolDensity: number;
    tokensPerBranch: number;
    tokensPerSecond?: number;
  };
  quantumStateMetrics: {
    circuitDepth: number;
    activeGateCount: number;
    confidenceDivergence: number; // Variance sigma^2 = (1/N) * sum((c_i - c_mean)^2)
    entropyScore: number;         // Binary Shannon entropy
    resolvedBranchesCount: number; // confidence >= 0.8 or <= 0.2
    superpositionBranchesCount: number; // 0.4 <= confidence <= 0.6
  };
}

export interface QuantumCircuitState {
  sessionId: string;
  step: number;
  maxStep: number;
  branches: QuantumBranch[];
  gates: GateOp[];
  isPaused: boolean;
  isComplete: boolean;
  presetCircuit?: PresetCircuitType;
  llmResponses: Array<{ id: string; timestamp: number; step: number; role: 'assistant'; content: string; query: string }>;
  circuitModifications: Array<{ timestamp: number; change: string }>;
  mermaid: string;
}

export interface QuantumToolInput {
  action: 'setup' | 'step' | 'pause' | 'continue' | 'modify' | 'reset' | 'status' | 'get_state' | 'analyze';
  sessionId: string;
  numBranches?: number;
  personas?: string[];
  presetCircuit?: PresetCircuitType;
  gates?: GateOp[];
  query?: string;
  temperature?: number;
}

const DEFAULT_MAX_STEP = 4;
const sessions = new Map<string, QuantumCircuitState>();

function freshBranch(id: number, persona: string): QuantumBranch {
  return { id: `q${id}`, persona, stance: 'neutral', confidence: 0.5, evidence: [] };
}

function applyPresetCircuit(state: QuantumCircuitState, preset: PresetCircuitType) {
  const n = state.branches.length;
  switch (preset) {
    case 'superposition_exploration': {
      for (let i = 0; i < n; i++) {
        state.gates.push({ qubit: i, column: 0, gate: 'H' });
      }
      for (let i = 0; i < n; i++) {
        state.gates.push({ qubit: i, column: 1, gate: 'RY', param: 0.35 * (i + 1) });
      }
      for (let i = 0; i < n - 1; i++) {
        state.gates.push({ qubit: i, column: 2, gate: 'CNOT', target: i + 1 });
      }
      break;
    }
    case 'adversarial_debate': {
      state.gates.push({ qubit: 0, column: 0, gate: 'RY', param: 1.8 });
      if (n > 1) state.gates.push({ qubit: 1, column: 0, gate: 'RY', param: -1.8 });
      if (n > 2) state.gates.push({ qubit: 2, column: 0, gate: 'H' });

      if (n > 1) state.gates.push({ qubit: 1, column: 1, gate: 'X' });

      if (n > 1) state.gates.push({ qubit: 0, column: 2, gate: 'CNOT', target: 1 });
      if (n > 2) state.gates.push({ qubit: 1, column: 2, gate: 'CZ', target: 2 });

      state.gates.push({ qubit: 0, column: 3, gate: 'MEASURE' });
      if (n > 1) state.gates.push({ qubit: 1, column: 3, gate: 'MEASURE' });
      break;
    }
    case 'consensus_alignment': {
      for (let i = 0; i < n; i++) {
        state.gates.push({ qubit: i, column: 0, gate: 'H' });
        state.gates.push({ qubit: i, column: 1, gate: 'RY', param: 0.85 });
      }
      for (let i = 0; i < n - 1; i++) {
        state.gates.push({ qubit: i, column: 2, gate: 'CZ', target: i + 1 });
      }
      for (let i = 0; i < n; i++) {
        state.gates.push({ qubit: i, column: 3, gate: 'MEASURE' });
      }
      break;
    }
    case 'grover_amplification': {
      for (let i = 0; i < n; i++) {
        state.gates.push({ qubit: i, column: 0, gate: 'H' });
      }
      state.gates.push({ qubit: 0, column: 1, gate: 'Z' });
      state.gates.push({ qubit: 0, column: 2, gate: 'RY', param: 1.4 });
      for (let i = 0; i < n; i++) {
        state.gates.push({ qubit: i, column: 3, gate: 'MEASURE' });
      }
      break;
    }
    case 'entangled_verification': {
      for (let i = 0; i < n; i += 2) {
        state.gates.push({ qubit: i, column: 0, gate: 'H' });
        if (i + 1 < n) {
          state.gates.push({ qubit: i, column: 1, gate: 'CNOT', target: i + 1 });
        }
      }
      if (n >= 4) {
        state.gates.push({ qubit: 1, column: 2, gate: 'CZ', target: 3 });
      }
      for (let i = 1; i < n; i += 2) {
        state.gates.push({ qubit: i, column: 3, gate: 'MEASURE' });
      }
      break;
    }
  }
}

function getDefaultPersonasForPreset(preset?: PresetCircuitType): string[] | undefined {
  switch (preset) {
    case 'adversarial_debate':
      return ['Proponent', 'Opponent', 'Synthesizer'];
    case 'superposition_exploration':
      return ['Hypothesis Alpha', 'Hypothesis Beta', 'Hypothesis Gamma'];
    case 'consensus_alignment':
      return ['Domain Specialist A', 'Domain Specialist B', 'Integrator'];
    case 'grover_amplification':
      return ['Target Candidate', 'Alternative A', 'Alternative B', 'Alternative C'];
    case 'entangled_verification':
      return ['Worker Alpha', 'Verifier Alpha', 'Worker Beta', 'Verifier Beta'];
    default:
      return undefined;
  }
}

function createSession(sessionId: string, numBranches: number, personas?: string[], presetCircuit?: PresetCircuitType): QuantumCircuitState {
  const resolvedPersonas = personas || getDefaultPersonasForPreset(presetCircuit);
  const finalNumBranches = resolvedPersonas ? Math.max(numBranches, resolvedPersonas.length) : numBranches;
  const branches = Array.from({ length: finalNumBranches }, (_, i) =>
    freshBranch(i, resolvedPersonas?.[i] || `Branch ${i}`));
  const state: QuantumCircuitState = {
    sessionId,
    step: 0,
    maxStep: DEFAULT_MAX_STEP,
    branches,
    gates: [],
    isPaused: false,
    isComplete: false,
    presetCircuit,
    llmResponses: [],
    circuitModifications: [],
    mermaid: '',
  };

  if (presetCircuit) {
    applyPresetCircuit(state, presetCircuit);
  }

  state.mermaid = renderMermaid(state);
  sessions.set(sessionId, state);
  return state;
}

export function calculateQuantumMetrics(state: QuantumCircuitState, durationMs: number, llmStats?: QuantumCompressionStats & { llmInferenceMs?: number }, isStepAction: boolean = false): QuantumCircuitTelemetry {
  const confidences = state.branches.map(b => Math.max(0.001, Math.min(0.999, b.confidence)));
  const n = confidences.length || 1;
  const meanConf = confidences.reduce((a, b) => a + b, 0) / n;
  const variance = confidences.reduce((sum, c) => sum + (c - meanConf) ** 2, 0) / n;

  const entropy = confidences.reduce((sum, p) => {
    const q = 1 - p;
    return sum - (p * Math.log2(p) + q * Math.log2(q));
  }, 0) / n;

  const resolved = state.branches.filter(b => b.confidence >= 0.8 || b.confidence <= 0.2).length;
  const superposition = state.branches.filter(b => b.confidence >= 0.4 && b.confidence <= 0.6).length;

  const columns = state.gates.map(g => g.column);
  const depth = columns.length > 0 ? Math.max(...columns) + 1 : 0;

  const telemetry: QuantumCircuitTelemetry = {
    executionMetrics: {
      totalDurationMs: durationMs,
      gateExecutionMs: isStepAction ? durationMs : undefined,
      llmInferenceMs: llmStats?.llmInferenceMs,
    },
    quantumStateMetrics: {
      circuitDepth: depth,
      activeGateCount: state.gates.length,
      confidenceDivergence: Math.round(variance * 10000) / 10000,
      entropyScore: Math.round(entropy * 1000) / 1000,
      resolvedBranchesCount: resolved,
      superpositionBranchesCount: superposition,
    }
  };

  if (llmStats) {
    const rawTokens = llmStats.rawTokensEstimate || 100;
    const compTokens = llmStats.compressedTokensEstimate || rawTokens;
    const savings = rawTokens > 0 ? Math.max(0, Math.round(((rawTokens - compTokens) / rawTokens) * 100)) : 0;
    telemetry.tokenEfficiencyMatrix = {
      rawPromptTokens: rawTokens,
      compressedPromptTokens: compTokens,
      tokenSavingsPct: savings,
      symbolDensity: llmStats.symbolDensity || 0.5,
      tokensPerBranch: Math.round((compTokens / n) * 10) / 10,
      tokensPerSecond: llmStats.llmInferenceMs ? Math.round((compTokens / (llmStats.llmInferenceMs / 1000))) : undefined,
    };
  }

  return telemetry;
}

function requireSession(sessionId: string): QuantumCircuitState {
  const state = sessions.get(sessionId);
  if (!state) throw new Error(`No quantum_tool session "${sessionId}" — call action:'setup' first.`);
  return state;
}

/**
 * Composes a rotation onto a branch's confidence, treating confidence as a
 * measurement probability prob(1) = sin^2(phi/2) — the real single-qubit RY
 * rotation formula from |0>. Recovering phi via asin(sqrt(confidence)) and
 * adding theta before recomputing sin^2 is genuine rotation composition, not
 * an arbitrary blend.
 */
function applyRotation(branch: QuantumBranch, theta: number) {
  const phi = 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, branch.confidence))));
  const newPhi = phi + theta;
  branch.confidence = Math.sin(newPhi / 2) ** 2;
  branch.stance = branch.confidence > 0.5 ? 'for' : branch.confidence < 0.5 ? 'against' : 'neutral';
}

function applyGate(state: QuantumCircuitState, op: GateOp) {
  const branch = state.branches[op.qubit];
  if (!branch) throw new Error(`Gate references unknown qubit/branch index ${op.qubit}`);

  switch (op.gate) {
    case 'H':
      branch.confidence = 0.5;
      branch.stance = 'neutral';
      branch.evidence.push('H: reset to superposition (maximal uncertainty).');
      break;
    case 'X':
      branch.stance = branch.stance === 'for' ? 'against' : branch.stance === 'against' ? 'for' : 'for';
      branch.confidence = 1 - branch.confidence;
      branch.evidence.push('X: stance flipped.');
      break;
    case 'Y':
      branch.stance = branch.stance === 'for' ? 'against' : branch.stance === 'against' ? 'for' : 'for';
      branch.confidence = 1 - branch.confidence;
      branch.evidence.push('Y: stance flipped with phase.');
      break;
    case 'Z':
      // Real Z leaves computational-basis probabilities unchanged — no
      // confidence/stance change, only a phase note for the record.
      branch.evidence.push('Z: relative phase marked (no observable stance change).');
      break;
    case 'RY': {
      const theta = op.param ?? 0;
      applyRotation(branch, theta);
      branch.evidence.push(`RY(${theta.toFixed(3)}): confidence rotated to ${branch.confidence.toFixed(3)}.`);
      break;
    }
    case 'RZ':
      // Real RZ is a phase-only gate in the computational basis too.
      branch.evidence.push(`RZ(${(op.param ?? 0).toFixed(3)}): relative phase marked (no observable stance change).`);
      break;
    case 'CNOT': {
      if (op.target === undefined) throw new Error('CNOT requires a target qubit');
      const control = branch;
      const target = state.branches[op.target];
      if (!target) throw new Error(`CNOT target qubit ${op.target} not found`);
      if (control.confidence > 0.5) {
        target.stance = target.stance === 'for' ? 'against' : target.stance === 'against' ? 'for' : 'for';
        target.confidence = 1 - target.confidence;
        target.evidence.push(`CNOT: flipped by control ${control.id} (confidence ${control.confidence.toFixed(2)}).`);
      }
      break;
    }
    case 'CZ': {
      if (op.target === undefined) throw new Error('CZ requires a target qubit');
      const target = state.branches[op.target];
      if (!target) throw new Error(`CZ target qubit ${op.target} not found`);
      target.evidence.push(`CZ: correlated with ${branch.id} (no observable stance change).`);
      break;
    }
    case 'SWAP': {
      if (op.target === undefined) throw new Error('SWAP requires a target qubit');
      const target = state.branches[op.target];
      if (!target) throw new Error(`SWAP target qubit ${op.target} not found`);
      const tmpStance = branch.stance, tmpConf = branch.confidence;
      branch.stance = target.stance; branch.confidence = target.confidence;
      target.stance = tmpStance; target.confidence = tmpConf;
      break;
    }
    case 'MEASURE':
      branch.stance = branch.confidence >= 0.5 ? 'for' : 'against';
      branch.confidence = branch.confidence >= 0.5 ? 1 : 0;
      branch.evidence.push(`MEASURE: collapsed to '${branch.stance}'.`);
      break;
    case 'BARRIER':
      break; // visual-only separator, no state effect
    default:
      throw new Error(`Unsupported gate: ${(op as any).gate}`);
  }
}

function renderMermaid(state: QuantumCircuitState): string {
  const lines = ['graph LR'];
  for (const branch of state.branches) {
    const label = `${branch.id}["${branch.persona}<br/>${branch.stance} (${branch.confidence.toFixed(2)})"]`;
    lines.push(`  ${label}`);
  }
  const gatesByColumn = new Map<number, GateOp[]>();
  for (const g of state.gates) {
    if (!gatesByColumn.has(g.column)) gatesByColumn.set(g.column, []);
    gatesByColumn.get(g.column)!.push(g);
  }
  const columns = Array.from(gatesByColumn.keys()).sort((a, b) => a - b);
  for (const col of columns) {
    for (const g of gatesByColumn.get(col)!) {
      const from = state.branches[g.qubit]?.id;
      if (g.target !== undefined) {
        const to = state.branches[g.target]?.id;
        if (from && to) lines.push(`  ${from} -->|${g.gate}@col${col}| ${to}`);
      } else if (from) {
        lines.push(`  ${from} -->|${g.gate}@col${col}| ${from}`);
      }
    }
  }
  return lines.join('\n');
}

async function callAnalyzeLLM(state: QuantumCircuitState, query: string, temperature: number, sessionId: string): Promise<{ content: string; stats: QuantumCompressionStats; llmInferenceMs: number }> {
  const branchSummary = state.branches
    .map(b => `- ${b.persona} (${b.id}): stance=${b.stance}, confidence=${b.confidence.toFixed(2)}. Evidence: ${b.evidence.join(' ') || '(none yet)'}`)
    .join('\n');

  const rawPrompt = `You are reasoning across ${state.branches.length} parallel perspective branches on a question, built up over ${state.step} circuit steps.\n\nBranch states:\n${branchSummary}\n\nUser question: ${query}\n\nSynthesize a reasoned answer that explicitly weighs the branches by their confidence, notes where they agree/disagree, and flags any branch still near 0.5 confidence (unresolved).`;

  const stats = quantumCompressWithStats(rawPrompt, temperature);

  const llmStart = Date.now();
  const { useFreeLLM } = await import('./use-free-llm.js');
  const result = await useFreeLLM({
    messages: [{ role: 'user', content: stats.compressedText }],
    taskType: TaskType.Reasoning,
    sessionId,
    isOnePass: true,
  } as any);
  const llmInferenceMs = Date.now() - llmStart;

  const choices: Array<{ message?: { content?: string } }> = Array.isArray((result as any)?.choices) ? (result as any).choices : [];
  const content = choices.map(c => c?.message?.content ?? '').filter(Boolean).join('\n\n') || '(no response generated)';
  return { content, stats, llmInferenceMs };
}

export async function quantumTool(input: QuantumToolInput) {
  const start = Date.now();
  const action = input.action;
  const sessionId = input.sessionId || 'quantum_default_session';
  let result: any;
  let isError = false;

  try {
    if (action === 'setup') {
      const state = createSession(sessionId, input.numBranches ?? 3, input.personas, input.presetCircuit);
      const durationMs = Date.now() - start;
      const telemetry = calculateQuantumMetrics(state, durationMs);
      result = { success: true, sessionId, state, telemetry };
    } else if (action === 'modify') {
      const state = requireSession(sessionId);
      const newGates = input.gates || [];
      state.gates.push(...newGates);
      state.circuitModifications.push({ timestamp: Date.now(), change: `Added ${newGates.length} gate(s) at column(s) ${[...new Set(newGates.map(g => g.column))].join(',')}` });
      state.mermaid = renderMermaid(state);
      const durationMs = Date.now() - start;
      const telemetry = calculateQuantumMetrics(state, durationMs);
      result = { success: true, sessionId, state, telemetry };
    } else if (action === 'step') {
      const state = requireSession(sessionId);
      if (state.isPaused) {
        result = { success: false, error: 'Session is paused. Call action:"continue" first.' };
      } else if (state.isComplete) {
        result = { success: false, error: 'Circuit already complete. Call action:"reset" to start over.' };
      } else {
        const columnGates = state.gates.filter(g => g.column === state.step);
        for (const g of columnGates) applyGate(state, g);
        state.step += 1;
        if (state.step >= state.maxStep) state.isComplete = true;
        state.mermaid = renderMermaid(state);
        const durationMs = Date.now() - start;
        const telemetry = calculateQuantumMetrics(state, durationMs, undefined, true);
        result = { success: true, sessionId, appliedGates: columnGates.length, state, telemetry };
      }
    } else if (action === 'pause') {
      const state = requireSession(sessionId);
      state.isPaused = true;
      const durationMs = Date.now() - start;
      const telemetry = calculateQuantumMetrics(state, durationMs);
      result = { success: true, sessionId, state, telemetry };
    } else if (action === 'continue') {
      const state = requireSession(sessionId);
      state.isPaused = false;
      const durationMs = Date.now() - start;
      const telemetry = calculateQuantumMetrics(state, durationMs);
      result = { success: true, sessionId, state, telemetry };
    } else if (action === 'reset') {
      const existing = requireSession(sessionId);
      const state = createSession(sessionId, existing.branches.length, existing.branches.map(b => b.persona), existing.presetCircuit);
      const durationMs = Date.now() - start;
      const telemetry = calculateQuantumMetrics(state, durationMs);
      result = { success: true, sessionId, state, telemetry };
    } else if (action === 'status' || action === 'get_state') {
      const state = requireSession(sessionId);
      state.mermaid = renderMermaid(state);
      const durationMs = Date.now() - start;
      const telemetry = calculateQuantumMetrics(state, durationMs);
      result = { success: true, sessionId, state, telemetry };
    } else if (action === 'analyze') {
      const state = requireSession(sessionId);
      if (!input.query) throw new Error('query is required for action:"analyze"');
      const { content, stats, llmInferenceMs } = await callAnalyzeLLM(state, input.query, input.temperature ?? 0.7, sessionId);
      const entry = { id: `resp-${Date.now()}`, timestamp: Date.now(), step: state.step, role: 'assistant' as const, content, query: input.query };
      state.llmResponses.push(entry);
      const durationMs = Date.now() - start;
      const telemetry = calculateQuantumMetrics(state, durationMs, { ...stats, llmInferenceMs });
      result = { success: true, sessionId, response: entry, telemetry };
    } else {
      throw new Error(`Unknown quantum_tool action: ${action}`);
    }
  } catch (err: any) {
    isError = true;
    result = { success: false, error: err?.message || String(err) };
  }

  await logToolCall(sessionId, `quantum_tool:${action}`, input, result, Date.now() - start, isError).catch(() => {});
  return result;
}
