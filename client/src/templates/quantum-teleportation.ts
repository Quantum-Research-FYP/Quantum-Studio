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
    headerImageSrc: '/images/algorithms/quantum-teleportation.jpg',
    description: "A protocol for transmitting a quantum state over a distance using classical communication and quantum entanglement.",
    sections: [
      {
        title: "Overview",
        content: `Quantum teleportation allows the transfer of a quantum state from one location to another without physically moving the particle itself. It relies on two components: a pre-shared entangled Bell pair between the sender (Alice) and receiver (Bob), and a classical communication channel.\n\nAlice performs a Bell measurement on her qubit and half of the entangled pair, then sends the two resulting classical bits to Bob. Bob uses these bits to apply the necessary Pauli corrections to his half of the pair, perfectly recreating Alice's initial state.`
      },
      {
        title: "Protocol Steps",
        content: `1. Entanglement Sharing: Create a Bell state and distribute one qubit to Alice and one to Bob.\n2. Bell Measurement: Alice applies a CNOT and H gate to the state to be teleported and her entangled qubit, then measures them.\n3. Classical Transmission: Alice sends the two classical measurement outcomes to Bob.\n4. Correction: Bob applies an X and/or Z gate based on the classical bits to recover the state.`
      },
      {
        title: "Use Cases",
        content: `• Quantum Networks: Routing quantum information between distant nodes.\n• Quantum Computing Architecture: Moving states between different processors or memory units.\n• Secure Communication: Providing the foundation for advanced quantum cryptographic protocols.`
      }
    ]
  }
};
