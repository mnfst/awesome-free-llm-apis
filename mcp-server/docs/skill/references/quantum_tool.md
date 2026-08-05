# `quantum_tool` (added v1.0.9)

**Purpose:** Multi-branch/persona reasoning aid that uses quantum-circuit vocabulary as a metaphor for hypothesis exploration — real single-qubit-rotation math grounds how a "gate" moves a branch's confidence, but the underlying content being reasoned about (a persona's stance and evidence) is plain HITL research support, not a physics simulation.

**Required params:** `action`, `sessionId`

### Model
- **Branch** (`QuantumBranch`): `{ id, persona, stance: 'for'|'against'|'neutral', confidence, evidence[] }` — one per reasoning "qubit".
- **Gate** (`GateOp`): `{ qubit, column, gate, target?, param? }` — `H | X | Y | Z | RY | RZ | CNOT | CZ | SWAP | MEASURE | BARRIER`.

Gate semantics (`src/tools/quantum-tool.ts`):
- `H` — resets confidence to 0.5/neutral (superposition).
- `X`/`Y` — flips stance, confidence → `1 - confidence`.
- `Z`/`RZ` — **no-op on confidence/stance** — these are real phase-only gates that don't affect computational-basis measurement probability; only an evidence note is logged.
- `RY(theta)` — real rotation composition: recovers `phi = 2*asin(sqrt(confidence))`, adds `theta`, recomputes `confidence = sin²(newPhi/2)`.
- `CNOT` — if the control branch's confidence > 0.5, flips the target branch (classical-correlation metaphor).
- `MEASURE` — collapses confidence to exactly 0 or 1.

### Actions
`setup, step, pause, continue, modify, reset, status, get_state, analyze`

`analyze` calls the real `useFreeLLM` pipeline with a compressed prompt (`src/utils/quantum-compression.ts`'s local, non-LLM `quantumCompress()`) summarizing all branch states, and records the response in `llmResponses`.

### Invocation
```json
{ "action": "setup", "sessionId": "s1", "numBranches": 2, "personas": ["Optimist", "Skeptic"] }
```
```json
{ "action": "modify", "sessionId": "s1", "gates": [{ "qubit": 0, "column": 0, "gate": "RY", "param": 1.2 }] }
```
```json
{ "action": "analyze", "sessionId": "s1", "query": "What should we conclude?" }
```

### Non-goals
No dedicated drag-and-drop circuit builder UI — the dashboard reuses the generic Tool Playground form (with JSON/array param parsing for `gates`/`personas`). A `renderMermaid()` helper produces a simple `graph LR` diagram string in `get_state`/`step` responses for callers that want to render one themselves.
