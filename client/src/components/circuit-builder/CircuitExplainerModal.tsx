/**
 * CircuitExplainerModal.tsx
 *
 * "Explain My Circuit" AI & Pedagogical Teacher:
 * Analyzes the user's active canvas circuit, identifies algorithmic patterns
 * (Bell state, Superposition, Entanglement, QFT), breaks down wire physics,
 * and predicts measurement probabilities.
 */
import { useMemo } from 'react';
import type { CircuitModel } from '../../circuit';
import './CircuitExplainerModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  circuit: CircuitModel;
  onAskAiWithContext?: (prompt: string) => void;
}

interface CircuitAnalysis {
  patternName: string;
  patternBadge: string;
  summary: string;
  stateEquation: string;
  wireBreakdowns: Array<{ wire: string; text: string }>;
  expectedOutcomes: Array<{ basis: string; prob: string }>;
  learningTip: string;
}

function analyzeCircuit(circuit: CircuitModel): CircuitAnalysis {
  const ops = circuit.operations;
  const gateCount = ops.length;
  const qubits = circuit.qubits;

  if (gateCount === 0) {
    return {
      patternName: 'Empty Circuit',
      patternBadge: '⚪ Ground State',
      summary: 'Your circuit currently has no gates. All qubits remain in their default |0⟩ ground state.',
      stateEquation: '|ψ⟩ = |' + '0'.repeat(qubits) + '⟩',
      wireBreakdowns: Array.from({ length: qubits }, (_, i) => ({
        wire: `q[${i}]`,
        text: 'Initialized to ground state |0⟩. No operations applied.',
      })),
      expectedOutcomes: [{ basis: '|' + '0'.repeat(qubits) + '⟩', prob: '100%' }],
      learningTip: '💡 Try dragging a Hadamard (H) gate onto wire q[0] to create a quantum superposition!',
    };
  }

  const hasH = ops.some((o) => o.type === 'H');
  const hasCX = ops.some((o) => o.type === 'CX');

  // Check for Bell State: H on q0, CX with control q0, target q1
  const isBellState =
    qubits >= 2 &&
    ops.some((o) => o.type === 'H' && o.targets.qubits.includes(0)) &&
    ops.some((o) => o.type === 'CX' && o.targets.qubits[0] === 0 && o.targets.qubits[1] === 1);

  // Check for GHZ State (3+ qubits with H then cascading CXs)
  const isGhzState =
    qubits >= 3 &&
    isBellState &&
    ops.some((o) => o.type === 'CX' && (o.targets.qubits[0] === 1 || o.targets.qubits[0] === 0) && o.targets.qubits[1] === 2);

  if (isGhzState) {
    return {
      patternName: 'GHZ Maximally Entangled State',
      patternBadge: '🌟 Multi-Qubit Entanglement',
      summary:
        'This circuit creates a Greenberger–Horne–Zeilinger (GHZ) state: a maximally entangled tripartite quantum state where all 3 qubits are simultaneously entangled together.',
      stateEquation: '|GHZ⟩ = (|' + '0'.repeat(qubits) + '⟩ + |' + '1'.repeat(qubits) + '⟩) / √2',
      wireBreakdowns: [
        { wire: 'q[0]', text: 'Enters superposition via H gate (|0⟩+|1⟩)/√2, then acts as control qubit.' },
        { wire: 'q[1]', text: 'Entangled with q[0] via first CNOT gate.' },
        { wire: 'q[2]', text: 'Entangled with the pair via second CNOT gate.' },
      ],
      expectedOutcomes: [
        { basis: '|' + '0'.repeat(qubits) + '⟩', prob: '50.0%' },
        { basis: '|' + '1'.repeat(qubits) + '⟩', prob: '50.0%' },
      ],
      learningTip:
        '💡 Measuring any single qubit immediately collapses all 3 qubits to the same value (all 0s or all 1s)!',
    };
  }

  if (isBellState) {
    return {
      patternName: 'Bell State (|Φ⁺⟩)',
      patternBadge: '🔗 Quantum Entanglement',
      summary:
        'This circuit creates the famous Bell State (|Φ⁺⟩). Qubit q[0] is put into equal superposition and then entangled with q[1] using a Controlled-NOT gate.',
      stateEquation: '|Φ⁺⟩ = (|00⟩ + |11⟩) / √2',
      wireBreakdowns: [
        { wire: 'q[0]', text: 'Hadamard gate maps |0⟩ ➔ (|0⟩+|1⟩)/√2, creating a 50/50 superposition.' },
        { wire: 'q[1]', text: 'CNOT gate flips q[1] whenever q[0] is in state |1⟩, producing maximum entanglement.' },
      ],
      expectedOutcomes: [
        { basis: '|00⟩', prob: '50.0%' },
        { basis: '|11⟩', prob: '50.0%' },
      ],
      learningTip:
        '💡 Notice that |01⟩ and |10⟩ have 0% probability! The measurement outcomes of q0 and q1 will always be identical.',
    };
  }

  if (hasH && !hasCX) {
    const hCount = ops.filter((o) => o.type === 'H').length;
    return {
      patternName: 'Quantum Superposition State',
      patternBadge: '🌊 Superposition',
      summary:
        'Your circuit uses Hadamard gates to place one or more qubits into quantum superposition, creating an equal probability distribution across basis states.',
      stateEquation: '|ψ⟩ = ' + ops.filter((o) => o.type === 'H').map((o) => `(|0⟩+|1⟩)/√2 on q[${o.targets.qubits[0]}]`).join(' ⊗ '),
      wireBreakdowns: Array.from({ length: qubits }, (_, i) => {
        const wireOps = ops.filter((o) => o.targets.qubits.includes(i));
        return {
          wire: `q[${i}]`,
          text: wireOps.length > 0 ? wireOps.map((o) => o.type).join(' ➔ ') : 'Remains in |0⟩ ground state.',
        };
      }),
      expectedOutcomes: [
        { basis: 'Equal Superposition', prob: `${(100 / Math.pow(2, hCount)).toFixed(1)}% each` },
      ],
      learningTip:
        '💡 Adding an X gate before H creates state (|0⟩-|1⟩)/√2 (known as the |-⟩ state).',
    };
  }

  // General circuit fallback
  return {
    patternName: 'Custom Quantum Algorithm',
    patternBadge: `🔬 ${gateCount} Gate Operations`,
    summary: `Your circuit applies ${gateCount} quantum operations across ${qubits} qubits. Operations include: ${Array.from(new Set(ops.map((o) => o.type))).join(', ')}.`,
    stateEquation: '|ψ⟩ = U |' + '0'.repeat(qubits) + '⟩',
    wireBreakdowns: Array.from({ length: qubits }, (_, i) => {
      const wireOps = ops.filter((o) => o.targets.qubits.includes(i));
      return {
        wire: `q[${i}]`,
        text: wireOps.length > 0 ? wireOps.map((o) => o.type).join(' ➔ ') : 'Idle in state |0⟩.',
      };
    }),
    expectedOutcomes: [
      { basis: 'Unitary Evolution', prob: 'Calculated in State Visualizer' },
    ],
    learningTip:
      '💡 You can use the "Run" button to execute this circuit on the simulator or real IBM hardware to see the exact counts histogram!',
  };
}

export default function CircuitExplainerModal({
  isOpen,
  onClose,
  circuit,
  onAskAiWithContext,
}: Props) {
  const analysis = useMemo(() => (isOpen ? analyzeCircuit(circuit) : null), [circuit, isOpen]);

  if (!isOpen || !analysis) return null;

  return (
    <div className="circuit-explainer-overlay" role="dialog" aria-modal="true" aria-labelledby="circuit-explainer-title">
      <div className="circuit-explainer-window">
        {/* Header */}
        <header className="circuit-explainer-header">
          <div className="circuit-explainer-title-row">
            <span className="circuit-explainer-icon">💡</span>
            <div>
              <h2 id="circuit-explainer-title" className="circuit-explainer-title">
                Explain My Circuit
              </h2>
              <span className="circuit-explainer-subtitle">
                AI & Pedagogical Circuit Analysis: Physics, State Math & Expected Outcomes
              </span>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="circuit-explainer-body">
          {/* Classification Banner */}
          <div className="circuit-explainer-classification">
            <span className="classification-tag">{analysis.patternBadge}</span>
            <h3 style={{ margin: '4px 0 8px', fontSize: '1.05rem', color: 'var(--color-text)' }}>
              {analysis.patternName}
            </h3>
            <p className="classification-summary">{analysis.summary}</p>
          </div>

          {/* Theoretical State Math */}
          <div className="circuit-explainer-card">
            <div className="circuit-explainer-card-title">
              <span>📐 Theoretical State Equation</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: 'var(--color-primary)', background: 'var(--color-surface-3)', padding: '10px 14px', borderRadius: '4px' }}>
              {analysis.stateEquation}
            </div>
          </div>

          {/* Wire by Wire Breakdown */}
          <div className="circuit-explainer-card">
            <div className="circuit-explainer-card-title">
              <span>🧵 Wire-by-Wire Physical Evolution</span>
            </div>
            <div className="wire-timeline-list">
              {analysis.wireBreakdowns.map((wb) => (
                <div key={wb.wire} className="wire-timeline-item">
                  <span className="wire-badge">{wb.wire}</span>
                  <span>{wb.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expected Measurement Outcomes */}
          <div className="circuit-explainer-card">
            <div className="circuit-explainer-card-title">
              <span>🎯 Expected Measurement Probabilities</span>
            </div>
            <div className="prob-outcome-grid">
              {analysis.expectedOutcomes.map((eo, idx) => (
                <div key={idx} className="prob-outcome-card">
                  <span className="prob-outcome-basis">{eo.basis}</span>
                  <span className="prob-outcome-val">{eo.prob}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Learning Tip */}
          <div className="guide-tip-banner">{analysis.learningTip}</div>
        </div>

        {/* Footer */}
        <footer className="circuit-explainer-footer">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              onClose();
              if (onAskAiWithContext) {
                onAskAiWithContext(`Can you explain my current circuit: ${analysis.patternName}? It has ${circuit.operations.length} gates across ${circuit.qubits} qubits.`);
              }
            }}
          >
            🤖 Ask AI Tutor More Questions
          </button>
          <button className="btn btn--primary btn--sm" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
