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
    headerImageSrc: '/images/algorithms/grover.jpg',
    description: "A quantum search algorithm that provides a quadratic speedup for unstructured search problems.",
    sections: [
      {
        title: "Overview",
        content: `Grover's algorithm demonstrates a quantum advantage by searching an unsorted database of N items in O(√N) time, compared to classical algorithms which require O(N) time.\n\nIt works through amplitude amplification: iteratively reflecting the quantum state about the average amplitude and the target state to dramatically increase the probability of measuring the correct answer.`
      },
      {
        title: "Circuit Components",
        content: `1. Initialization: Apply Hadamard gates to all qubits to create an equal superposition of all states.\n2. Oracle: Flips the phase of the target state(s).\n3. Diffuser (Amplification): Inverts the amplitudes about the mean, amplifying the target state.\n4. Measurement: Collapses the state, most likely yielding the target.`
      },
      {
        title: "Use Cases",
        content: `• Database Search: Finding a specific entry in an unstructured dataset.\n• Collision Finding: Cryptographic applications and hash function inversion.\n• Optimization Problems: Speeding up exhaustive search techniques.`
      }
    ]
  }
};
