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
  learnMore: {
    headerImageSrc: '/images/algorithms/bell-state.jpg',
    description: "A fundamental quantum circuit that creates an entangled pair of qubits.",
    sections: [
      {
        title: "Overview",
        content: `A Bell State represents the simplest and most elegant example of quantum entanglement. When two qubits are entangled, the quantum state of each particle cannot be described independently of the state of the other(s), even when the particles are separated by a large distance.\n\nIn this template, an H gate places the first qubit in superposition, and a CNOT (CX) gate entangles it with the second qubit. This creates the |Φ+⟩ state. Measuring one qubit instantaneously determines the state of the other, resulting in outcomes of either both 00 or both 11.`
      },
      {
        title: "Circuit Matrix",
        content: `The transformation matrix for the Bell State circuit (CNOT · (H ⊗ I)) is:\n\n[ 1/√2,  0,  1/√2,  0 ]\n[  0, 1/√2,   0, 1/√2 ]\n[  0, 1/√2,   0,-1/√2 ]\n[ 1/√2,  0, -1/√2,  0 ]`
      },
      {
        title: "Use Cases",
        content: `• Quantum Teleportation: Transporting quantum information across distances.\n• Superdense Coding: Transmitting two classical bits of information using only one qubit.\n• Quantum Key Distribution (QKD): Securing communication channels.`
      }
    ]
  }
};
