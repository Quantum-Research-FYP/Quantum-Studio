import type { TemplateDefinition } from './types';

/**
 * GHZ (Greenberger–Horne–Zeilinger) state template for 3 qubits.
 *
 * Creates the maximally entangled state |GHZ⟩ = (|000⟩ + |111⟩) / √2.
 *
 * Circuit:
 *   q0: ─ H ─ ● ─ ● ─ M ─
 *   q1: ─────⊕──────── M ─
 *   q2: ───────────⊕── M ─
 *
 * Expected results at sufficient shots: ~50% "000", ~50% "111".
 */
export const ghzStateTemplate: TemplateDefinition = {
  templateId: 'ghz-state',
  name: 'GHZ State',
  description: 'Entangle three qubits into a maximally correlated GHZ state.',
  tags: ['entanglement', 'beginner'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 3,
    operations: [
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 1 },
      { type: 'CX', targets: { qubits: [0, 2] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [2], clbits: [2] }, time: 3 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    headerImageSrc: '/images/algorithms/ghz-state.jpg',
    description: "Creates a Greenberger-Horne-Zeilinger state, maximally entangling three or more qubits.",
    sections: [
      {
        title: "Overview",
        content: `A GHZ state is a type of entangled quantum state that involves at least three subsystems (qubits). The standard 3-qubit GHZ state is (|000⟩ + |111⟩) / √2.\n\nIt demonstrates multi-partite entanglement, which has fundamentally different properties than bi-partite entanglement (like Bell states). For instance, measuring one qubit immediately collapses the entire state of the other two qubits to a definite classical state.`
      },
      {
        title: "Circuit Matrix",
        content: `The circuit for a 3-qubit GHZ state involves:\n1. A Hadamard gate on q0.\n2. A CNOT gate from q0 to q1.\n3. A CNOT gate from q1 to q2.\n\nThis creates a cascade of entanglement spanning all three qubits.`
      },
      {
        title: "Use Cases",
        content: `• Quantum Secret Sharing: Distributing a secret amongst multiple parties where all must collaborate to unlock it.\n• Quantum Error Correction: Forming the basis of many error-correcting codes (like the Shor code).\n• Bell's Theorem Tests: Providing a deterministic refutation of local hidden variable theories (GHZ experiment).`
      }
    ]
  }
};
