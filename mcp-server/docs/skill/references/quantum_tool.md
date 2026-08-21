# `quantum_tool` (v1.0.9 Update)

**Purpose:** Multi-branch/persona reasoning aid that uses quantum-circuit vocabulary as a metaphor for hypothesis exploration — real single-qubit-rotation math grounds how a "gate" moves a branch's confidence, but the underlying content being reasoned about (a persona's stance and evidence) is plain HITL research support, not a physics simulation.

**Required params:** `action`, `sessionId`

### Model
- **Branch** (`QuantumBranch`): `{ id, persona, stance: 'for'|'against'|'neutral', confidence, evidence[] }` — one per reasoning "qubit".
- **Gate** (`GateOp`): `{ qubit, column, gate, target?, param? }` — `H | X | Y | Z | RY | RZ | CNOT | CZ | SWAP | MEASURE | BARRIER`.

### Preset Circuit Topologies (`presetCircuit`)
1. `superposition_exploration`: Hadamard dispersion across all branches for hypothesis generation, exploratory small $R_Y$ rotations, and entangled adjacent branches.
2. `adversarial_debate`: Alternating $R_Y$ stances (Proponent vs Opponent), $X$ stance counter-arguments, and $CNOT$ cross-examination before measurement.
3. `consensus_alignment`: Parallel Hadamard states followed by converging parameterized $R_Y$ rotations and $CZ$ phase marking.
4. `grover_amplification`: Amplitude amplification boosting confidence of target candidate hypothesis while maintaining alternatives.
5. `entangled_verification`: Multi-pair Bell-state entanglement ($H$ + $CNOT$) and cross-system $CZ$ verification.

### Telemetry & Token Efficiency Matrix
Every action returns real-time `telemetry`:
- `executionMetrics`:
  - `totalDurationMs`: Total execution time.
  - `gateExecutionMs`: Time spent stepping gates.
  - `llmInferenceMs`: Time spent in `useFreeLLM` synthesis.
- `tokenEfficiencyMatrix`:
  - `rawPromptTokens`: Estimated uncompressed prompt token budget.
  - `compressedPromptTokens`: Actual prompt tokens sent to the LLM after `quantumCompressWithStats`.
  - `tokenSavingsPct`: Percentage reduction in tokens.
  - `symbolDensity`: Meaningful token density retained.
  - `tokensPerBranch`: Token efficiency per reasoning branch.
  - `tokensPerSecond`: Generation throughput during analysis.
- `quantumStateMetrics`:
  - `circuitDepth`: Number of active column layers.
  - `activeGateCount`: Total gates applied.
  - `confidenceDivergence`: Variance $\sigma^2$ measuring stance spread.
  - `entropyScore`: Binary Shannon entropy across branches.
  - `resolvedBranchesCount`: Branches with confidence $\ge 0.8$ or $\le 0.2$.
  - `superpositionBranchesCount`: Branches in maximal uncertainty ($0.4 \le C \le 0.6$).

### Gate Semantics
- `H` — resets confidence to 0.5/neutral (superposition).
- `X`/`Y` — flips stance, confidence $\to 1 - \text{confidence}$.
- `Z`/`RZ` — **no-op on confidence/stance** — real phase-only gates that don't affect computational-basis measurement probability; records phase mark in evidence.
- `RY(theta)` — real rotation composition: recovers $\phi = 2\arcsin(\sqrt{\text{confidence}})$, adds $\theta$, recomputes $\text{confidence} = \sin^2(\text{newPhi}/2)$.
- `CNOT` — if the control branch's confidence > 0.5, flips target branch.
- `CZ` — phase correlation between control and target branch without changing confidence.
- `SWAP` — swaps stance and confidence between two branches.
- `MEASURE` — collapses confidence to exactly 0 or 1.

### Actions
`setup, step, pause, continue, modify, reset, status, get_state, analyze`

### Invocation Examples
```json
{
  "action": "setup",
  "sessionId": "s1",
  "presetCircuit": "adversarial_debate"
}
```
```json
{
  "action": "step",
  "sessionId": "s1"
}
```
```json
{
  "action": "analyze",
  "sessionId": "s1",
  "query": "Synthesize the debate conclusions",
  "temperature": 0.6
}
```

