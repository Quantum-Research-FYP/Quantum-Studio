import type { TemplateDefinition } from './types';

/**
 * Single-qubit superposition template — the simplest non-trivial quantum circuit.
 *
 * Applies a Hadamard gate to put a qubit into an equal superposition of |0⟩ and |1⟩,
 * then measures. Demonstrates that quantum measurement is inherently probabilistic.
 *
 * Circuit:
 *   q0: ─ H ─ M ─
 *
 * Expected results at sufficient shots: ~50% "0", ~50% "1".
 */
export const superpositionTemplate: TemplateDefinition = {
  templateId: 'superposition',
  name: 'Superposition',
  description: 'Put a single qubit into equal superposition with a Hadamard gate.',
  tags: ['superposition', 'beginner'],
  schemaVersion: 1,
  circuit: {
    qubits: 1,
    clbits: 1,
    operations: [
      { type: 'H',       targets: { qubits: [0] },              time: 0 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 1 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
};
