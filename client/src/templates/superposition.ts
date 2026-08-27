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
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 1 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
headerImageSrc: '/images/algorithms/superposition.jpg',
description: "The most basic quantum concept: putting a qubit into a state of both 0 and 1 simultaneously.",
sections: [
      {
        title: "Overview",
        content: `Superposition is the fundamental principle of quantum mechanics that allows a quantum system to be in multiple states at the same time until it is measured. \n\nApplying a Hadamard (H) gate to a qubit initially in the |0⟩ state places it into an equal superposition of |0⟩ and |1⟩. This means there is a 50% probability of measuring a 0, and a 50% probability of measuring a 1.`
      },
      {
        title: "Matrix & Circuit",
        content: `The circuit consists of a single Hadamard gate applied to a single qubit.\n\nThe Hadamard matrix is:\n[ 1/√2,  1/√2 ]\n[ 1/√2, -1/√2 ]\n\nWhen applied to |0⟩ = [1, 0]^T, it yields [1/√2, 1/√2]^T, which is the |+⟩ state.`
      },
      {
        title: "Use Cases",
        content: `• Quantum Random Number Generation: Producing truly random outcomes.\n• Algorithm Initialization: Serving as the first step for almost all quantum algorithms (like Grover's or Shor's) to explore multiple paths simultaneously.\n• Educational Foundation: The starting point for learning quantum computing.`
      }
]
}
};
