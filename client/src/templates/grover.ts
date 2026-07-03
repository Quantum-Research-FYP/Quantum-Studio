import type { TemplateDefinition } from './types';

/**
 * Grover's search algorithm template for 2 qubits, searching for |11⟩.
 *
 * With N=4 states and 1 marked state, a single Grover iteration achieves
 * theoretical certainty (probability ≈ 1) for finding the marked state.
 *
 * Circuit structure (1 iteration):
 *   1. Superposition: H on both qubits
 *   2. Oracle (marks |11⟩ with phase flip via CZ = H·CX·H):
 *      - H(q1), CX(q0,q1), H(q1)
 *   3. Diffusion operator (2|s⟩⟨s| - I):
 *      - H(q0), H(q1), X(q0), X(q1), H(q1), CX(q0,q1), H(q1), X(q0), X(q1), H(q0), H(q1)
 *   4. Measurement on both qubits
 *
 * Expected results: majority outcome "11" at sufficient shots.
 */
export const groverTemplate: TemplateDefinition = {
  templateId: 'grover-2q',
  name: 'Grover',
  description: 'Search for a marked state using amplitude amplification.',
  tags: ['search', 'amplitude-amplification', 'beginner'],
  schemaVersion: 1,
  circuit: {
    qubits: 2,
    clbits: 2,
    operations: [
      // Step 1: Equal superposition
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'H', targets: { qubits: [1] }, time: 0 },

      // Step 2: Oracle — CZ gate marks |11⟩ (implemented as H·CX·H)
      { type: 'H', targets: { qubits: [1] }, time: 1 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 2 },
      { type: 'H', targets: { qubits: [1] }, time: 3 },

      // Step 3: Diffusion operator (2|s⟩⟨s| - I)
      { type: 'H', targets: { qubits: [0] }, time: 4 },
      { type: 'H', targets: { qubits: [1] }, time: 4 },
      { type: 'X', targets: { qubits: [0] }, time: 5 },
      { type: 'X', targets: { qubits: [1] }, time: 5 },
      { type: 'H', targets: { qubits: [1] }, time: 6 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 7 },
      { type: 'H', targets: { qubits: [1] }, time: 8 },
      { type: 'X', targets: { qubits: [0] }, time: 9 },
      { type: 'X', targets: { qubits: [1] }, time: 9 },
      { type: 'H', targets: { qubits: [0] }, time: 10 },
      { type: 'H', targets: { qubits: [1] }, time: 10 },

      // Step 4: Measurement
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 11 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 11 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    imageSrc: '/images/algorithms/grover.png',
    longDescription: `Grover's Search Algorithm is a quantum algorithm that finds with high probability the unique input to a black box function that produces a particular output value. 

While classical algorithms require O(N) operations to search an unstructured database, Grover's algorithm provides a quadratic speedup, solving the problem in O(√N) time. It works by using amplitude amplification to increase the probability of measuring the correct answer.`
  }
};
