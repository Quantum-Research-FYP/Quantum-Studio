import { describe, expect, it } from 'vitest';
import { generateQiskitCode } from '../codegen';
import { addClbit, addQubit, createEmptyCircuit, placeGate } from '../model';

describe('generateQiskitCode', () => {
  it('returns placeholder for empty circuit (no qubits)', () => {
    const circuit = createEmptyCircuit();
    const code = generateQiskitCode(circuit);
    expect(code).toBe('# Add qubits and gates to generate Qiskit code');
  });

  it('generates imports and construction for circuit with qubits only', () => {
    const circuit = addQubit(addQubit(createEmptyCircuit()));
    const code = generateQiskitCode(circuit);
    expect(code).toContain('from qiskit import QuantumCircuit');
    expect(code).toContain('qc = QuantumCircuit(2)');
    expect(code).not.toContain('QuantumCircuit(2,');
  });

  it('includes clbits in construction when present', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    const code = generateQiskitCode(circuit);
    expect(code).toContain('qc = QuantumCircuit(1, 1)');
  });

  it('generates single-qubit gate calls', () => {
    let circuit = addQubit(createEmptyCircuit());
    ({ circuit } = placeGate(circuit, 'H', { qubits: [0] }, 0));
    ({ circuit } = placeGate(circuit, 'X', { qubits: [0] }, 1));
    ({ circuit } = placeGate(circuit, 'Y', { qubits: [0] }, 2));
    ({ circuit } = placeGate(circuit, 'Z', { qubits: [0] }, 3));
    ({ circuit } = placeGate(circuit, 'S', { qubits: [0] }, 4));
    ({ circuit } = placeGate(circuit, 'T', { qubits: [0] }, 5));

    const code = generateQiskitCode(circuit);
    expect(code).toContain('qc.h(0)');
    expect(code).toContain('qc.x(0)');
    expect(code).toContain('qc.y(0)');
    expect(code).toContain('qc.z(0)');
    expect(code).toContain('qc.s(0)');
    expect(code).toContain('qc.t(0)');
  });

  it('generates CX gate call', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    ({ circuit } = placeGate(circuit, 'CX', { qubits: [0, 1] }, 0));
    const code = generateQiskitCode(circuit);
    expect(code).toContain('qc.cx(0, 1)');
  });

  it('generates MEASURE call', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    ({ circuit } = placeGate(circuit, 'MEASURE', { qubits: [0], clbits: [0] }, 0));
    const code = generateQiskitCode(circuit);
    expect(code).toContain('qc.measure(0, 0)');
  });

  it('orders operations by time, then by id', () => {
    let circuit = addQubit(createEmptyCircuit());
    // Place X at time 1 first, then H at time 0
    ({ circuit } = placeGate(circuit, 'X', { qubits: [0] }, 1));
    ({ circuit } = placeGate(circuit, 'H', { qubits: [0] }, 0));

    const code = generateQiskitCode(circuit);
    const hIndex = code.indexOf('qc.h(0)');
    const xIndex = code.indexOf('qc.x(0)');
    expect(hIndex).toBeLessThan(xIndex);
  });

  it('produces deterministic output for the same circuit', () => {
    let circuit = addQubit(addQubit(createEmptyCircuit()));
    ({ circuit } = placeGate(circuit, 'H', { qubits: [0] }, 0));
    ({ circuit } = placeGate(circuit, 'CX', { qubits: [0, 1] }, 1));

    const code1 = generateQiskitCode(circuit);
    const code2 = generateQiskitCode(circuit);
    expect(code1).toBe(code2);
  });

  it('ends with a trailing newline', () => {
    const circuit = addQubit(createEmptyCircuit());
    const code = generateQiskitCode(circuit);
    expect(code).toMatch(/\n$/);
  });
});
