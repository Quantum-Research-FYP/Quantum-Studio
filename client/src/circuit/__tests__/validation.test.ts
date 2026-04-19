import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../validation';
import type { CircuitModel } from '../types';

/** Helper to create a circuit with specific state for validation testing. */
function makeCircuit(overrides: Partial<CircuitModel> = {}): CircuitModel {
  return {
    schemaVersion: 1,
    qubits: 2,
    clbits: 1,
    operations: [],
    ...overrides,
  };
}

describe('validateCircuit', () => {
  it('returns no errors for a valid empty circuit', () => {
    const errors = validateCircuit(makeCircuit());
    expect(errors).toEqual([]);
  });

  it('returns no errors for valid operations', () => {
    const circuit = makeCircuit({
      operations: [
        { id: '1', type: 'H', targets: { qubits: [0] }, time: 0 },
        { id: '2', type: 'X', targets: { qubits: [1] }, time: 1 },
        { id: '3', type: 'CX', targets: { qubits: [0, 1] }, time: 2 },
        { id: '4', type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 3 },
      ],
    });
    const errors = validateCircuit(circuit);
    expect(errors).toEqual([]);
  });

  it('detects qubit index out of range', () => {
    const circuit = makeCircuit({
      qubits: 1,
      operations: [{ id: '1', type: 'H', targets: { qubits: [5] }, time: 0 }],
    });
    const errors = validateCircuit(circuit);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('qubit 5');
    expect(errors[0].operationId).toBe('1');
    expect(errors[0].wireType).toBe('qubit');
  });

  it('detects clbit index out of range for MEASURE', () => {
    const circuit = makeCircuit({
      clbits: 0,
      operations: [{ id: '1', type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 0 }],
    });
    const errors = validateCircuit(circuit);
    expect(errors.some((e) => e.message.includes('classical bit 0'))).toBe(true);
  });

  it('detects MEASURE missing clbit target', () => {
    const circuit = makeCircuit({
      operations: [{ id: '1', type: 'MEASURE', targets: { qubits: [0] }, time: 0 }],
    });
    const errors = validateCircuit(circuit);
    expect(errors.some((e) => e.message.includes('requires exactly 1 classical bit'))).toBe(true);
  });

  it('detects CX with wrong number of qubits', () => {
    const circuit = makeCircuit({
      operations: [{ id: '1', type: 'CX', targets: { qubits: [0] }, time: 0 }],
    });
    const errors = validateCircuit(circuit);
    expect(errors.some((e) => e.message.includes('requires 2 qubit(s)'))).toBe(true);
  });

  it('detects CX with identical qubits', () => {
    const circuit = makeCircuit({
      operations: [{ id: '1', type: 'CX', targets: { qubits: [0, 0] }, time: 0 }],
    });
    const errors = validateCircuit(circuit);
    expect(errors.some((e) => e.message.includes('distinct'))).toBe(true);
  });

  it('detects duplicate operation IDs', () => {
    const circuit = makeCircuit({
      operations: [
        { id: 'dup', type: 'H', targets: { qubits: [0] }, time: 0 },
        { id: 'dup', type: 'X', targets: { qubits: [1] }, time: 1 },
      ],
    });
    const errors = validateCircuit(circuit);
    expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('includes operation context in errors', () => {
    const circuit = makeCircuit({
      qubits: 1,
      operations: [{ id: 'op-abc', type: 'H', targets: { qubits: [5] }, time: 3 }],
    });
    const errors = validateCircuit(circuit);
    expect(errors[0].operationId).toBe('op-abc');
    expect(errors[0].time).toBe(3);
    expect(errors[0].wireIndex).toBe(5);
  });

  it('validates all single-qubit gate types', () => {
    const gateTypes = ['H', 'X', 'Y', 'Z', 'S', 'T'] as const;
    for (const type of gateTypes) {
      const circuit = makeCircuit({
        operations: [{ id: `${type}-1`, type, targets: { qubits: [0] }, time: 0 }],
      });
      const errors = validateCircuit(circuit);
      expect(errors).toEqual([]);
    }
  });
});
