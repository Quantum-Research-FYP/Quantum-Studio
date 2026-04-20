import type { TemplateDefinition } from './types';

/**
 * Bell state template: creates an entangled pair |Φ+⟩ = (|00⟩ + |11⟩) / √2.
 *
 * Circuit:
 *   q0: ─ H ─ ● ─ M ─
 *   q1: ─────⊕─── M ─
 *
 * Expected results at sufficient shots: ~50% "00", ~50% "11".
 */
export const bellStateTemplate: TemplateDefinition = {
  templateId: 'bell-state',
  name: 'Bell State',
  description: 'Create an entangled Bell pair and measure.',
  tags: ['entanglement', 'beginner'],
  schemaVersion: 1,
  circuit: {
    qubits: 2,
    clbits: 2,
    operations: [
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 1 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 2 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
};
