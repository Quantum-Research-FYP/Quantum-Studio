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
    imageSrc: '/images/algorithms/superdense-coding.jpg',
    longDescription: `Superdense coding is a quantum communication protocol that allows a sender (Alice) to transmit two classical bits of information to a receiver (Bob) by sending only a single qubit, provided they share an entangled pair beforehand.

The protocol works in reverse to quantum teleportation. Alice applies a set of gates (like X and Z) to her qubit to encode one of four possible messages (00, 01, 10, 11). She sends her qubit to Bob, who then performs a Bell measurement on both qubits to decode the two classical bits. This template encodes and decodes the message "11".`
  }
};
