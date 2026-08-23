import type { TemplateDefinition } from './types';

export const qftTemplate: TemplateDefinition = {
  templateId: 'qft',
  name: 'Quantum Fourier Transform',
  description: "A 3-qubit QFT circuit, essential for phase estimation and Shor's algorithm.",
  tags: ['advanced', 'algorithm'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 3,
    operations: [
      { type: 'H', targets: { qubits: [2] }, time: 0 },
      { type: 'CP', targets: { qubits: [1, 2] }, time: 1 },
      { type: 'CP', targets: { qubits: [0, 2] }, time: 2 },
      { type: 'H', targets: { qubits: [1] }, time: 3 },
      { type: 'CP', targets: { qubits: [0, 1] }, time: 4 },
      { type: 'H', targets: { qubits: [0] }, time: 5 },
      { type: 'SWAP', targets: { qubits: [0, 2] }, time: 6 },
      // Measure
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 7 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 7 },
      { type: 'MEASURE', targets: { qubits: [2], clbits: [2] }, time: 7 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
  learnMore: {
    imageSrc: '/images/algorithms/qft.jpg',
    longDescription: `The Quantum Fourier Transform (QFT) is the quantum analogue of the discrete Fourier transform. It is a linear transformation on quantum bits, and is the key ingredient in many quantum algorithms, most notably Shor's factoring algorithm and quantum phase estimation.

This template shows a 3-qubit QFT circuit. It operates by applying a sequence of Hadamard gates and controlled phase (CP) gates, followed by a SWAP gate to reverse the order of the qubits. The QFT transforms a quantum state from the computational basis to the Fourier basis.`,
  },
};
