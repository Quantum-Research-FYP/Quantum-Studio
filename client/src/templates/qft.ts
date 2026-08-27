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
    headerImageSrc: '/images/algorithms/qft.jpg',
    description: "The Quantum Fourier Transform, a linear transformation on quantum bits, analogous to the discrete Fourier transform.",
    sections: [
      {
        title: "Overview",
        content: `The QFT transforms a quantum state from the computational basis to the Fourier (or phase) basis. It is a critical subroutine in many of the most famous quantum algorithms, such as Shor's algorithm for factoring and quantum phase estimation.\n\nInstead of outputting probabilities directly, it encodes the frequency domain information into the relative phases of the qubits.`
      },
      {
        title: "Circuit Matrix",
        content: `The QFT matrix for an N-dimensional space (where N = 2^n) is defined by its entries:\nF_{j,k} = (1 / √N) * ω^(j*k)\nwhere ω = e^(2πi/N) is the primitive N-th root of unity.`
      },
      {
        title: "Use Cases",
        content: `• Shor's Algorithm: Factoring large integers exponentially faster than classical algorithms.\n• Quantum Phase Estimation: Estimating the eigenvalues of a unitary operator.\n• Hidden Subgroup Problem: Solving generalizations of period-finding problems.`
      }
    ]
  }
};
