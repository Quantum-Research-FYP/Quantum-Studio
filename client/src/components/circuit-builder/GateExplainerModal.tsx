/**
 * GateExplainerModal.tsx
 *
 * Interactive Gate Inspector & Pedagogical Guide:
 * Shows plain-English purpose, exact matrix math, state transformation rules,
 * Bloch sphere geometry, and 1-click AI queries for every quantum gate.
 */
import type { GateType } from '../../circuit';
import './GateExplainerModal.css';

interface Props {
  gateType: GateType | null;
  onClose: () => void;
  onAskAi?: (gateName: string) => void;
}

interface GateDetail {
  type: GateType;
  symbol: string;
  name: string;
  category: string;
  purpose: string;
  matrixText: string;
  rules: Array<{ input: string; output: string }>;
  blochAction: string;
  analogy: string;
}

const GATE_DETAILS: Record<string, GateDetail> = {
  H: {
    type: 'H',
    symbol: 'H',
    name: 'Hadamard Gate',
    category: 'Superposition Gate (1-Qubit)',
    purpose:
      'Creates an equal quantum superposition. It maps basis state |0⟩ into (|0⟩+|1⟩)/√2 and |1⟩ into (|0⟩-|1⟩)/√2. It is the fundamental starting point of almost every quantum algorithm.',
    matrixText: `1/√2 · [ 1   1 ]
      [ 1  -1 ]`,
    rules: [
      { input: '|0⟩', output: '(|0⟩ + |1⟩) / √2' },
      { input: '|1⟩', output: '(|0⟩ - |1⟩) / √2' },
    ],
    blochAction: 'Rotates the state vector by 180° (π radians) around the diagonal X+Z axis on the Bloch sphere.',
    analogy: 'Like flipping a coin into the air so it is in a spinning state between heads and tails until observed.',
  },
  X: {
    type: 'X',
    symbol: 'X',
    name: 'Pauli-X Gate (NOT)',
    category: 'Bit-Flip Gate (1-Qubit)',
    purpose:
      'The quantum equivalent of the classical NOT gate. It completely flips the state of a qubit, turning |0⟩ into |1⟩ and |1⟩ into |0⟩.',
    matrixText: `[ 0  1 ]
[ 1  0 ]`,
    rules: [
      { input: '|0⟩', output: '|1⟩' },
      { input: '|1⟩', output: '|0⟩' },
    ],
    blochAction: 'Rotates the state vector by 180° (π radians) around the X-axis of the Bloch sphere.',
    analogy: 'A clean 180-degree flip from the North pole (|0⟩) to the South pole (|1⟩).',
  },
  Y: {
    type: 'Y',
    symbol: 'Y',
    name: 'Pauli-Y Gate',
    category: 'Bit & Phase Flip (1-Qubit)',
    purpose:
      'Combines a bit-flip and a phase-flip with an imaginary phase factor i. Maps |0⟩ to i|1⟩ and |1⟩ to -i|0⟩.',
    matrixText: `[ 0  -i ]
[ i   0 ]`,
    rules: [
      { input: '|0⟩', output: 'i |1⟩' },
      { input: '|1⟩', output: '-i |0⟩' },
    ],
    blochAction: 'Rotates the state vector by 180° (π radians) around the Y-axis of the Bloch sphere.',
    analogy: 'Flips the qubit state while simultaneously shifting its phase into the complex plane.',
  },
  Z: {
    type: 'Z',
    symbol: 'Z',
    name: 'Pauli-Z Gate (Phase-Flip)',
    category: 'Phase Gate (1-Qubit)',
    purpose:
      'Flips the quantum phase without changing measurement probabilities. It leaves |0⟩ unchanged and maps |1⟩ to -|1⟩.',
    matrixText: `[ 1   0 ]
[ 0  -1 ]`,
    rules: [
      { input: '|0⟩', output: '|0⟩' },
      { input: '|1⟩', output: '-|1⟩' },
    ],
    blochAction: 'Rotates the state vector by 180° (π radians) around the Z-axis (equatorial rotation).',
    analogy: 'Changes the direction of the wave crest to a wave trough without changing wave height.',
  },
  S: {
    type: 'S',
    symbol: 'S',
    name: 'S Gate (Phase √Z)',
    category: 'Phase Gate (1-Qubit)',
    purpose:
      'Applies a quarter-turn (π/2 or 90°) phase rotation to state |1⟩. Two S gates applied back-to-back equal one Pauli-Z gate (S² = Z).',
    matrixText: `[ 1  0 ]
[ 0  i ]`,
    rules: [
      { input: '|0⟩', output: '|0⟩' },
      { input: '|1⟩', output: 'i |1⟩  (e^(iπ/2))' },
    ],
    blochAction: 'Rotates the state vector by 90° (π/2 radians) around the Z-axis.',
    analogy: 'A quarter turn around the equator of the Bloch sphere.',
  },
  T: {
    type: 'T',
    symbol: 'T',
    name: 'T Gate (π/8 Gate)',
    category: 'Universal Phase Gate (1-Qubit)',
    purpose:
      'Applies an eighth-turn (π/4 or 45°) phase rotation to state |1⟩. Crucial for universal fault-tolerant quantum computation.',
    matrixText: `[ 1       0      ]
[ 0  e^(iπ/4) ]`,
    rules: [
      { input: '|0⟩', output: '|0⟩' },
      { input: '|1⟩', output: 'e^(iπ/4) |1⟩' },
    ],
    blochAction: 'Rotates the state vector by 45° (π/4 radians) around the Z-axis.',
    analogy: 'Fine-tuned phase adjustment that enables universal quantum computing alongside Clifford gates.',
  },
  CX: {
    type: 'CX',
    symbol: 'CX',
    name: 'Controlled-NOT (CNOT)',
    category: 'Entangling Gate (2-Qubit)',
    purpose:
      'Flips the target qubit if and only if the control qubit is in state |1⟩. When combined with a Hadamard gate, it creates quantum entanglement.',
    matrixText: `[ 1  0  0  0 ]
[ 0  1  0  0 ]
[ 0  0  0  1 ]
[ 0  0  1  0 ]`,
    rules: [
      { input: '|00⟩', output: '|00⟩ (Control is 0: No flip)' },
      { input: '|10⟩', output: '|11⟩ (Control is 1: Target flips to 1)' },
    ],
    blochAction: 'Entangles two qubits together; their joint state can no longer be factored as independent Bloch spheres.',
    analogy: 'Like an conditional light switch: if the first light is ON, toggle the second light.',
  },
  CZ: {
    type: 'CZ',
    symbol: 'CZ',
    name: 'Controlled-Z Gate',
    category: 'Entangling Phase Gate (2-Qubit)',
    purpose:
      'Applies a phase-flip (-1) if and only if both control and target qubits are |1⟩. Symmetric between both qubits.',
    matrixText: `[ 1  0  0   0 ]
[ 0  1  0   0 ]
[ 0  0  1   0 ]
[ 0  0  0  -1 ]`,
    rules: [
      { input: '|11⟩', output: '-|11⟩ (Both 1: Adds negative phase)' },
      { input: '|00⟩, |01⟩, |10⟩', output: 'Unchanged' },
    ],
    blochAction: 'Adds a -1 phase factor selectively to the entangled |11⟩ basis component.',
    analogy: 'A symmetrical entanglement gate natively supported on many superconducting architectures.',
  },
  SWAP: {
    type: 'SWAP',
    symbol: 'SWAP',
    name: 'SWAP Gate',
    category: 'Routing Gate (2-Qubit)',
    purpose:
      'Exchanges the quantum states of two qubits. Decomposes into 3 alternating CNOT gates (CX-CX-CX).',
    matrixText: `[ 1  0  0  0 ]
[ 0  0  1  0 ]
[ 0  1  0  0 ]
[ 0  0  0  1 ]`,
    rules: [
      { input: '|01⟩', output: '|10⟩ (States exchanged)' },
      { input: '|10⟩', output: '|01⟩ (States exchanged)' },
    ],
    blochAction: 'Transfers the state of qubit A to qubit B and vice versa.',
    analogy: 'Like swapping the contents of two quantum memory registers.',
  },
  MEASURE: {
    type: 'MEASURE',
    symbol: 'M',
    name: 'Measurement Operation',
    category: 'Quantum-to-Classical Readout',
    purpose:
      'Collapses a quantum superposition into a definitive classical bit (0 or 1) with probabilities determined by Born’s Rule (|α|² and |β|²).',
    matrixText: `Projection Operator:
P₀ = |0⟩⟨0|,  P₁ = |1⟩⟨1|`,
    rules: [
      { input: 'α|0⟩ + β|1⟩', output: '0 (Prob: |α|²) OR 1 (Prob: |β|²)' },
    ],
    blochAction: 'Collapses the Bloch vector from anywhere in the sphere down onto the North (|0⟩) or South (|1⟩) pole.',
    analogy: 'Opening Schrödinger’s box to find the cat definitively alive (0) or dead (1).',
  },
};

export default function GateExplainerModal({ gateType, onClose, onAskAi }: Props) {
  if (!gateType) return null;

  const detail: GateDetail = GATE_DETAILS[gateType] || {
    type: gateType,
    symbol: gateType,
    name: `${gateType} Gate`,
    category: 'Quantum Gate',
    purpose: `Applies the ${gateType} quantum operation to the qubit.`,
    matrixText: '[ Unitary Matrix ]',
    rules: [{ input: '|ψ⟩', output: `${gateType}|ψ⟩` }],
    blochAction: 'Transforms the quantum state vector on the Bloch sphere.',
    analogy: 'Performs a unitary rotation in the Hilbert space.',
  };

  return (
    <div className="gate-explainer-overlay" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-explainer-window">
        {/* Header */}
        <header className="gate-explainer-header">
          <div className="gate-explainer-badge-row">
            <div className="gate-explainer-symbol">{detail.symbol}</div>
            <div>
              <h3 id="gate-title" className="gate-explainer-title">
                {detail.name}
              </h3>
              <span className="gate-explainer-category">{detail.category}</span>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="gate-explainer-body">
          {/* Purpose */}
          <div className="gate-explainer-section">
            <span className="gate-explainer-label">What Does It Do?</span>
            <p className="gate-explainer-desc">{detail.purpose}</p>
          </div>

          {/* Transformation Rules */}
          <div className="gate-explainer-section">
            <span className="gate-explainer-label">State Transformation Rule</span>
            <div className="gate-explainer-rules-grid">
              {detail.rules.map((r, i) => (
                <div key={i} className="gate-explainer-rule-card">
                  <span className="gate-explainer-rule-title">Input: {r.input}</span>
                  <span className="gate-explainer-rule-math">➔ {r.output}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Unitary Matrix */}
          <div className="gate-explainer-section">
            <span className="gate-explainer-label">Unitary Matrix Representation</span>
            <div className="gate-explainer-matrix-box">
              <pre style={{ margin: 0, lineHeight: 1.5 }}>{detail.matrixText}</pre>
            </div>
          </div>

          {/* Bloch Sphere Geometry */}
          <div className="gate-explainer-section">
            <span className="gate-explainer-label">Bloch Sphere Rotation</span>
            <div className="gate-explainer-bloch-box">
              <span className="gate-explainer-bloch-icon">🌐</span>
              <span className="gate-explainer-bloch-text">{detail.blochAction}</span>
            </div>
          </div>

          {/* Analogy */}
          <div className="gate-explainer-section">
            <span className="gate-explainer-label">Intuitive Analogy</span>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              "{detail.analogy}"
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="gate-explainer-footer">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              onClose();
              if (onAskAi) onAskAi(detail.name);
            }}
          >
            🤖 Ask AI Tutor About {detail.symbol} Gate
          </button>
          <button className="btn btn--primary btn--sm" onClick={onClose}>
            Got It!
          </button>
        </footer>
      </div>
    </div>
  );
}
