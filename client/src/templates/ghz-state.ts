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
};
