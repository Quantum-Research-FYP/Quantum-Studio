import type { TemplateDefinition } from './types';

/**
 * Deutsch-Jozsa algorithm template (1 input qubit, balanced oracle).
 *
 * Determines in one query whether f: {0,1} → {0,1} is constant or balanced.
 * Classical algorithms require 2 queries; this circuit needs only 1.
 *
 * Setup:
 *   q0 = input qubit, q1 = ancilla initialised to |−⟩ via X then H.
 *
 * Oracle: CX(q0→q1) implements f(x) = x (a balanced function).
 *
 * Circuit:
 *   q0: ─────── H ─ ● ─ H ─ M ─
 *   q1: ─ X ─ H ─  ⊕ ─────── M ─
 *
 * Expected results: q0 = "1" (balanced function detected), q1 = "1" (ancilla).
 */
export const deutschJozsaTemplate: TemplateDefinition = {
  templateId: 'deutsch-jozsa',
  name: 'Deutsch-Jozsa',
  description: 'Decide if a function is constant or balanced with a single quantum query.',
  tags: ['algorithm', 'intermediate'],
  schemaVersion: 1,
  circuit: {
    qubits: 2,
    clbits: 2,
    operations: [
      // Prepare ancilla in |−⟩
      { type: 'X',       targets: { qubits: [1] },    time: 0 },

      // Hadamard on input and ancilla
      { type: 'H',       targets: { qubits: [0] },    time: 1 },
      { type: 'H',       targets: { qubits: [1] },    time: 1 },

      // Balanced oracle: f(x) = x  →  CX(q0, q1)
      { type: 'CX',      targets: { qubits: [0, 1] }, time: 2 },

      // Final Hadamard on input qubit
      { type: 'H',       targets: { qubits: [0] },    time: 3 },

      // Measure (q0 = 1 → balanced, q0 = 0 → constant)
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 4 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 4 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    imageSrc: '/images/algorithms/deutsch-jozsa.png',
    longDescription: `The Deutsch-Jozsa algorithm was one of the first examples of a quantum algorithm that is exponentially faster than any possible deterministic classical algorithm. 

It solves a specific black-box problem: determining if a given function (the "oracle") is either completely constant (returns the same value for all inputs) or balanced (returns 0 for half of inputs and 1 for the other half). A classical computer requires multiple queries, but this quantum algorithm solves it in a single query by exploiting quantum interference.`
  }
};
