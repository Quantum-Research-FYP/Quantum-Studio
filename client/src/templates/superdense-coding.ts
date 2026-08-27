import type { TemplateDefinition } from './types';

export const superdenseCodingTemplate: TemplateDefinition = {
  templateId: 'superdense-coding',
  name: 'Superdense Coding',
  description: 'Transmit two classical bits of information using only one qubit.',
  tags: ['entanglement', 'intermediate', 'communication'],
  schemaVersion: 1,
  circuit: {
    qubits: 2,
    clbits: 2,
    operations: [
      // Create Bell pair
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 1 },
      // Encode "11" by applying X and Z
      { type: 'X', targets: { qubits: [0] }, time: 2 },
      { type: 'Z', targets: { qubits: [0] }, time: 3 },
      // Decode
      { type: 'CX', targets: { qubits: [0, 1] }, time: 4 },
      { type: 'H', targets: { qubits: [0] }, time: 5 },
      // Measure
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 6 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 6 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    headerImageSrc: '/images/algorithms/superdense-coding.jpg',
    description: "Transmits two classical bits of information using only one quantum bit.",
    sections: [
      {
        title: "Overview",
        content: `Superdense coding is a remarkable quantum communication protocol that allows a sender (Alice) to transmit two classical bits of information to a receiver (Bob) by sending only a single qubit.\n\nThis is achieved by pre-sharing an entangled Bell pair. Alice performs one of four possible quantum operations (I, X, Z, or XZ) on her half of the entangled pair, then sends her qubit to Bob. Bob performs a Bell measurement on the two qubits to decode the two classical bits.`
      },
      {
        title: "Protocol Steps",
        content: `1. Entanglement: Alice and Bob share a Bell pair.\n2. Encoding: Alice applies a local gate to her qubit based on the 2-bit message:\n   - '00': Apply Identity (I)\n   - '01': Apply Pauli-X (X)\n   - '10': Apply Pauli-Z (Z)\n   - '11': Apply Pauli-X then Pauli-Z (iY)\n3. Transmission: Alice sends her qubit to Bob.\n4. Decoding: Bob applies a CNOT and H gate, then measures to reveal the 2 bits.`
      },
      {
        title: "Use Cases",
        content: `• Channel Capacity: Doubling the classical information capacity of a quantum channel.\n• Quantum Cryptography: Enhancing secure communication protocols.\n• Resource Optimization: Maximizing information transfer in resource-constrained quantum networks.`
      }
    ]
  }
};
