import type { TemplateDefinition } from './types';

export const quantumTeleportationTemplate: TemplateDefinition = {
  templateId: 'quantum-teleportation',
  name: 'Quantum Teleportation',
  description: 'Transmit the state of one qubit to another using entanglement.',
  tags: ['entanglement', 'intermediate', 'communication'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 3,
    operations: [
      // Prepare some state to teleport on q0
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      // Create Bell pair between q1 and q2
      { type: 'H', targets: { qubits: [1] }, time: 0 },
      { type: 'CX', targets: { qubits: [1, 2] }, time: 1 },
      // Alice's operations on q0 and q1
      { type: 'CX', targets: { qubits: [0, 1] }, time: 2 },
      { type: 'H', targets: { qubits: [0] }, time: 3 },
      // Bob's operations on q2 based on Alice's qubits (using deferred measurement principle)
      { type: 'CX', targets: { qubits: [1, 2] }, time: 4 },
      { type: 'CZ', targets: { qubits: [0, 2] }, time: 5 },
      // Measurement
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 6 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 6 },
      { type: 'MEASURE', targets: { qubits: [2], clbits: [2] }, time: 6 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    imageSrc: '/images/algorithms/quantum-teleportation.jpg',
    longDescription: `Quantum teleportation is a protocol that allows the quantum state of a qubit to be transmitted from one location to another, without physically moving the particle itself. It relies on quantum entanglement and classical communication.

In this circuit, Alice wants to send a state (prepared on q0) to Bob (q2). They share an entangled pair (q1 and q2). Alice entangles her state with her half of the Bell pair, then measures both. Depending on her results, Bob applies specific gates to his qubit, recovering the exact state Alice originally had.`
  }
};
