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
      { type: 'X', targets: { qubits: [1] }, time: 0 },

      // Hadamard on input and ancilla
      { type: 'H', targets: { qubits: [0] }, time: 1 },
      { type: 'H', targets: { qubits: [1] }, time: 1 },

      // Balanced oracle: f(x) = x  →  CX(q0, q1)
      { type: 'CX', targets: { qubits: [0, 1] }, time: 2 },

      // Final Hadamard on input qubit
      { type: 'H', targets: { qubits: [0] }, time: 3 },

      // Measure (q0 = 1 → balanced, q0 = 0 → constant)
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 4 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 4 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    headerImageSrc: '/images/algorithms/deutsch-jozsa.jpg',
    description: "One of the first examples of a quantum algorithm that is exponentially faster than any possible deterministic classical algorithm.",
    sections: [
      {
        title: "Overview",
        content: `The Deutsch-Jozsa algorithm solves a black-box problem: determining whether a given function (the oracle) is constant (outputs the same value for all inputs) or balanced (outputs 1 for half the inputs and 0 for the other half).\n\nClassically, determining this with 100% certainty requires 2^(n-1) + 1 queries. The quantum algorithm determines the answer with 100% certainty in exactly one single query, exploiting phase kickback.`
      },
      {
        title: "Circuit Matrix",
        content: `The algorithm uses an 'n' qubit register for the input and a single ancillary qubit initialized to |->. After applying Hadamards to all qubits, querying the oracle, and applying Hadamards again, the measurement of the input register will be 00...0 if the function is constant, and anything else if it is balanced.`
      },
      {
        title: "Use Cases",
        content: `• Algorithmic Foundations: Essential for understanding early quantum algorithm design.\n• Verification: Testing quantum computers and oracle implementations.\n• Complexity Theory: Proving separations between quantum and classical complexity classes.`
      }
    ]
  }
};
