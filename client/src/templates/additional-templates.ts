import type { TemplateDefinition } from './types';

export const phaseKickbackTemplate: TemplateDefinition = {
  templateId: 'phase-kickback',
  name: 'Phase Kickback',
  description: 'Observe how a controlled operation transfers phase to its control qubit.',
  tags: ['phase', 'interference', 'intermediate'],
  schemaVersion: 1,
  circuit: {
    qubits: 2,
    clbits: 2,
    operations: [
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'X', targets: { qubits: [1] }, time: 0 },
      { type: 'H', targets: { qubits: [1] }, time: 1 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 2 },
      { type: 'H', targets: { qubits: [0] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 4 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 4 },
    ],
  },
  defaultExecutionConfig: { shots: 1024 },
  learnMore: {
    headerImageSrc: '/images/algorithms/phase-kickback.jpg',
    description:
      'A compact demonstration of how a controlled quantum operation can transfer phase information back to its control qubit.',
    sections: [
      {
        title: 'Overview',
        content:
          'Phase kickback is a uniquely quantum effect used throughout phase estimation and many oracle-based algorithms. When the target is prepared in an eigenstate of a controlled operation, the target can remain unchanged while its eigenvalue appears as a relative phase on the control qubit.',
      },
      {
        title: 'How the Circuit Works',
        content:
          'The control qubit is placed in superposition. The target is prepared in the |−⟩ state using X followed by H. Applying CNOT leaves the target in |−⟩ but changes the relative phase of the control. The final Hadamard converts that hidden phase into a measurable computational-basis result.',
      },
      {
        title: 'Use Cases',
        content:
          '• Quantum phase estimation and eigenvalue extraction.\n• Understanding controlled-unitary operations.\n• Building intuition for Deutsch–Jozsa and Bernstein–Vazirani algorithms.',
      },
    ],
  },
};

export const toffoliLogicTemplate: TemplateDefinition = {
  templateId: 'toffoli-logic',
  name: 'Toffoli Logic',
  description: 'Explore reversible AND logic using a three-qubit controlled-controlled-X gate.',
  tags: ['toffoli', 'reversible-logic', 'beginner'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 3,
    operations: [
      { type: 'X', targets: { qubits: [0] }, time: 0 },
      { type: 'X', targets: { qubits: [1] }, time: 0 },
      { type: 'CCX', targets: { qubits: [0, 1, 2] }, time: 1 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [2], clbits: [2] }, time: 2 },
    ],
  },
  defaultExecutionConfig: { shots: 1024 },
  learnMore: {
    headerImageSrc: '/images/algorithms/toffoli-logic.jpg',
    description:
      'A reversible three-qubit logic circuit built around the controlled-controlled-X, or Toffoli, gate.',
    sections: [
      {
        title: 'Overview',
        content:
          'The Toffoli gate flips its target only when both control qubits are |1⟩. Because the input can be reconstructed from the output, it is a fundamental building block for reversible computation and quantum arithmetic.',
      },
      {
        title: 'Circuit Behavior',
        content:
          'This example prepares both control qubits in |1⟩ and leaves the target in |0⟩. The CCX gate therefore flips the target to |1⟩. Change either input X gate in the builder to explore the complete reversible AND truth table.',
      },
      {
        title: 'Use Cases',
        content:
          '• Reversible Boolean logic.\n• Quantum adders and arithmetic circuits.\n• Oracle construction and fault-tolerant circuit design.',
      },
    ],
  },
};

export const swapTestTemplate: TemplateDefinition = {
  templateId: 'swap-test',
  name: 'SWAP Test',
  description: 'Compare two quantum states using an ancilla and a controlled-SWAP operation.',
  tags: ['state-comparison', 'fidelity', 'intermediate'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 1,
    operations: [
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'H', targets: { qubits: [1] }, time: 0 },
      { type: 'H', targets: { qubits: [2] }, time: 0 },
      { type: 'CSWAP', targets: { qubits: [0, 1, 2] }, time: 1 },
      { type: 'H', targets: { qubits: [0] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 3 },
    ],
  },
  defaultExecutionConfig: { shots: 2048 },
  learnMore: {
    headerImageSrc: '/images/algorithms/swap-test.jpg',
    description:
      'Estimate how similar two quantum states are by measuring a single ancilla qubit.',
    sections: [
      {
        title: 'Overview',
        content:
          'The SWAP test estimates the overlap between two quantum states without reconstructing their full statevectors. Identical states make the ancilla measure 0 with certainty, while increasingly different states raise the probability of measuring 1.',
      },
      {
        title: 'How the Circuit Works',
        content:
          'A Hadamard places the ancilla in superposition, a controlled-SWAP conditionally exchanges the two states, and a second Hadamard creates interference. The ancilla probability satisfies P(0) = (1 + |⟨ψ|φ⟩|²) / 2. This template starts with two matching |+⟩ states.',
      },
      {
        title: 'Use Cases',
        content:
          '• Quantum-state fidelity estimation.\n• Quantum machine-learning similarity measures.\n• Comparing prepared states without full tomography.',
      },
    ],
  },
};

export const repetitionCodeTemplate: TemplateDefinition = {
  templateId: 'repetition-code',
  name: 'Three-Qubit Repetition Code',
  description: 'Encode one logical bit across three qubits to demonstrate redundancy.',
  tags: ['error-correction', 'encoding', 'intermediate'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 3,
    operations: [
      { type: 'X', targets: { qubits: [0] }, time: 0 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 1 },
      { type: 'CX', targets: { qubits: [0, 2] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [2], clbits: [2] }, time: 3 },
    ],
  },
  defaultExecutionConfig: { shots: 1024 },
  learnMore: {
    headerImageSrc: '/images/algorithms/repetition-code.jpg',
    description:
      'Encode one logical bit across three physical qubits, introducing the core idea behind quantum error correction.',
    sections: [
      {
        title: 'Overview',
        content:
          'The three-qubit repetition code protects classical basis information against a single bit-flip error by storing it redundantly. A logical |0⟩ becomes |000⟩ and a logical |1⟩ becomes |111⟩.',
      },
      {
        title: 'Encoding Circuit',
        content:
          'The first qubit is prepared in |1⟩. Two CNOT gates copy its computational-basis value onto the other qubits, producing |111⟩. Measurements expose the redundant encoding; try inserting an X gate on one encoded qubit to model a bit-flip error.',
      },
      {
        title: 'Use Cases and Limits',
        content:
          '• Introducing logical and physical qubits.\n• Demonstrating redundancy and majority voting.\n• Preparing for stabilizer codes. This basic circuit does not itself perform syndrome detection or coherent recovery.',
      },
    ],
  },
};

export const reversibleHalfAdderTemplate: TemplateDefinition = {
  templateId: 'reversible-half-adder',
  name: 'Reversible Half-Adder',
  description: 'Calculate sum and carry bits with CNOT and Toffoli gates.',
  tags: ['arithmetic', 'reversible-logic', 'intermediate'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 3,
    operations: [
      { type: 'X', targets: { qubits: [0] }, time: 0 },
      { type: 'X', targets: { qubits: [1] }, time: 0 },
      { type: 'CCX', targets: { qubits: [0, 1, 2] }, time: 1 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 3 },
      { type: 'MEASURE', targets: { qubits: [2], clbits: [2] }, time: 3 },
    ],
  },
  defaultExecutionConfig: { shots: 1024 },
  learnMore: {
    headerImageSrc: '/images/algorithms/reversible-half-adder.jpg',
    description:
      'A small quantum arithmetic circuit that calculates the sum and carry of two input bits reversibly.',
    sections: [
      {
        title: 'Overview',
        content:
          'A half-adder combines two input bits and produces a sum bit and a carry bit. In reversible form, CNOT computes the XOR sum while a Toffoli gate computes the AND carry without erasing the original information.',
      },
      {
        title: 'Circuit Behavior',
        content:
          'Both inputs are prepared as 1. The Toffoli writes their carry into the third qubit, then CNOT updates the second qubit with the XOR sum. For inputs 1 and 1, the sum is 0 and the carry is 1.',
      },
      {
        title: 'Use Cases',
        content:
          '• Learning reversible arithmetic.\n• Constructing ripple-carry quantum adders.\n• Building arithmetic oracles for larger algorithms.',
      },
    ],
  },
};
