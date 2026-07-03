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
      { type: 'H',       targets: { qubits: [0] },    time: 0 },
      { type: 'CX',      targets: { qubits: [0, 1] }, time: 1 },
      { type: 'CX',      targets: { qubits: [0, 2] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [2], clbits: [2] }, time: 3 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    imageSrc: '/images/algorithms/ghz-state.png',
    longDescription: `The Greenberger-Horne-Zeilinger (GHZ) state is a type of entangled quantum state that involves at least three subsystems (qubits). It is an extreme example of multipartite entanglement.

Unlike a Bell state, GHZ states exhibit non-local properties that contradict classical physics even more strongly. In this circuit, we use an H gate followed by two CNOT gates to entangle three qubits, resulting in an equal probability of measuring 000 or 111.`
  }
};
