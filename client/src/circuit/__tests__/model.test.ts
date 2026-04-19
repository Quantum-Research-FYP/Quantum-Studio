import { describe, expect, it } from 'vitest';
import {
  addClbit,
  addQubit,
  createEmptyCircuit,
  deleteGate,
  getDependentOperations,
  moveGate,
  placeGate,
  removeWireWithDependents,
} from '../model';

describe('createEmptyCircuit', () => {
  it('returns a valid empty circuit with schemaVersion 1', () => {
    const circuit = createEmptyCircuit();
    expect(circuit).toEqual({
      schemaVersion: 1,
      qubits: 0,
      clbits: 0,
      operations: [],
    });
  });
});

describe('addQubit / addClbit', () => {
  it('increments qubit count', () => {
    const c0 = createEmptyCircuit();
    const c1 = addQubit(c0);
    const c2 = addQubit(c1);
    expect(c0.qubits).toBe(0);
    expect(c1.qubits).toBe(1);
    expect(c2.qubits).toBe(2);
  });

  it('increments clbit count', () => {
    const c0 = createEmptyCircuit();
    const c1 = addClbit(c0);
    expect(c1.clbits).toBe(1);
  });

  it('does not mutate the original circuit', () => {
    const c0 = createEmptyCircuit();
    addQubit(c0);
    expect(c0.qubits).toBe(0);
  });
});

describe('placeGate', () => {
  it('places a single-qubit gate', () => {
    const circuit = addQubit(createEmptyCircuit());
    const { circuit: updated, operation } = placeGate(circuit, 'H', { qubits: [0] }, 0);
    expect(updated.operations).toHaveLength(1);
    expect(operation.type).toBe('H');
    expect(operation.targets.qubits).toEqual([0]);
    expect(operation.time).toBe(0);
    expect(operation.id).toBeTruthy();
  });

  it('places a CX gate with two qubits', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    const { operation } = placeGate(circuit, 'CX', { qubits: [0, 1] }, 0);
    expect(operation.type).toBe('CX');
    expect(operation.targets.qubits).toEqual([0, 1]);
  });

  it('places a MEASURE gate with qubit and clbit', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    const { operation } = placeGate(circuit, 'MEASURE', { qubits: [0], clbits: [0] }, 0);
    expect(operation.type).toBe('MEASURE');
    expect(operation.targets.clbits).toEqual([0]);
  });

  it('throws on out-of-range qubit index', () => {
    const circuit = addQubit(createEmptyCircuit());
    expect(() => placeGate(circuit, 'H', { qubits: [5] }, 0)).toThrow(/out of range/);
  });

  it('throws when CX targets are identical', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    expect(() => placeGate(circuit, 'CX', { qubits: [0, 0] }, 0)).toThrow(/distinct/);
  });

  it('throws when CX has wrong number of qubits', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    expect(() => placeGate(circuit, 'CX', { qubits: [0] }, 0)).toThrow(/requires 2/);
  });

  it('throws on negative time', () => {
    const circuit = addQubit(createEmptyCircuit());
    expect(() => placeGate(circuit, 'H', { qubits: [0] }, -1)).toThrow(/non-negative/);
  });

  it('throws when MEASURE has no clbit target', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    expect(() => placeGate(circuit, 'MEASURE', { qubits: [0] }, 0)).toThrow(
      /requires exactly 1 classical bit/,
    );
  });

  it('does not mutate original circuit', () => {
    const circuit = addQubit(createEmptyCircuit());
    const { circuit: updated } = placeGate(circuit, 'H', { qubits: [0] }, 0);
    expect(circuit.operations).toHaveLength(0);
    expect(updated.operations).toHaveLength(1);
  });
});

describe('moveGate', () => {
  it('moves an operation to a new time column', () => {
    const circuit = addQubit(createEmptyCircuit());
    const { circuit: c1, operation } = placeGate(circuit, 'H', { qubits: [0] }, 0);
    const c2 = moveGate(c1, operation.id, 3);
    expect(c2.operations[0].time).toBe(3);
  });

  it('throws on non-existent operation id', () => {
    const circuit = addQubit(createEmptyCircuit());
    expect(() => moveGate(circuit, 'nonexistent', 0)).toThrow(/not found/);
  });

  it('throws on negative time', () => {
    const circuit = addQubit(createEmptyCircuit());
    const { circuit: c1, operation } = placeGate(circuit, 'X', { qubits: [0] }, 0);
    expect(() => moveGate(c1, operation.id, -1)).toThrow(/non-negative/);
  });
});

describe('deleteGate', () => {
  it('removes an operation by ID', () => {
    const circuit = addQubit(createEmptyCircuit());
    const { circuit: c1, operation } = placeGate(circuit, 'H', { qubits: [0] }, 0);
    const c2 = deleteGate(c1, operation.id);
    expect(c2.operations).toHaveLength(0);
  });

  it('throws on non-existent operation id', () => {
    const circuit = createEmptyCircuit();
    expect(() => deleteGate(circuit, 'nonexistent')).toThrow(/not found/);
  });

  it('preserves other operations', () => {
    const circuit = addQubit(createEmptyCircuit());
    const { circuit: c1, operation: op1 } = placeGate(circuit, 'H', { qubits: [0] }, 0);
    const { circuit: c2 } = placeGate(c1, 'X', { qubits: [0] }, 1);
    const c3 = deleteGate(c2, op1.id);
    expect(c3.operations).toHaveLength(1);
    expect(c3.operations[0].type).toBe('X');
  });
});

describe('getDependentOperations', () => {
  it('finds operations on a specific qubit', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    const { circuit: c1 } = placeGate(circuit, 'H', { qubits: [0] }, 0);
    const { circuit: c2 } = placeGate(c1, 'X', { qubits: [1] }, 0);

    const deps = getDependentOperations(c2, 'qubit', 0);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe('H');
  });

  it('finds operations on a specific clbit', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    const { circuit: c1 } = placeGate(circuit, 'MEASURE', { qubits: [0], clbits: [0] }, 0);

    const deps = getDependentOperations(c1, 'clbit', 0);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe('MEASURE');
  });

  it('returns empty array for wires with no operations', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    expect(getDependentOperations(circuit, 'qubit', 0)).toEqual([]);
  });
});

describe('removeWireWithDependents', () => {
  it('removes a qubit with no dependents', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    const { circuit: updated, removedOperations } = removeWireWithDependents(circuit, 'qubit', 1);
    expect(updated.qubits).toBe(1);
    expect(removedOperations).toHaveLength(0);
  });

  it('removes a qubit and its dependent operations', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    const { circuit: c1 } = placeGate(circuit, 'H', { qubits: [1] }, 0);
    const { circuit: updated, removedOperations } = removeWireWithDependents(c1, 'qubit', 1);
    expect(updated.qubits).toBe(1);
    expect(updated.operations).toHaveLength(0);
    expect(removedOperations).toHaveLength(1);
  });

  it('remaps indices of surviving operations', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    // Place gate on qubit 2
    const { circuit: c1 } = placeGate(circuit, 'H', { qubits: [2] }, 0);
    // Remove qubit 0 — qubit 2 should become qubit 1
    const { circuit: updated } = removeWireWithDependents(c1, 'qubit', 0);
    expect(updated.qubits).toBe(2);
    expect(updated.operations[0].targets.qubits).toEqual([1]);
  });

  it('throws on out-of-range index', () => {
    const circuit = createEmptyCircuit();
    expect(() => removeWireWithDependents(circuit, 'qubit', 0)).toThrow(/only 0/);
  });

  it('removes a clbit and remaps', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    circuit = addClbit(circuit);
    const { circuit: c1 } = placeGate(circuit, 'MEASURE', { qubits: [0], clbits: [1] }, 0);
    // Remove clbit 0 — clbit 1 becomes clbit 0
    const { circuit: updated } = removeWireWithDependents(c1, 'clbit', 0);
    expect(updated.clbits).toBe(1);
    expect(updated.operations[0].targets.clbits).toEqual([0]);
  });
});
