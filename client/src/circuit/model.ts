import type {
  CircuitModel,
  GateType,
  Operation,
  OperationTargets,
  WireRemovalResult,
  WireType,
} from './types';
import { GATE_QUBIT_COUNT, GATE_REQUIRES_CLBITS } from './types';

/** Create a new empty circuit with no wires or operations. */
export function createEmptyCircuit(): CircuitModel {
  return {
    schemaVersion: 1,
    qubits: 0,
    clbits: 0,
    operations: [],
  };
}

/** Return a new circuit with one additional qubit wire. */
export function addQubit(circuit: CircuitModel): CircuitModel {
  return { ...circuit, qubits: circuit.qubits + 1 };
}

/** Return a new circuit with one additional classical bit wire. */
export function addClbit(circuit: CircuitModel): CircuitModel {
  return { ...circuit, clbits: circuit.clbits + 1 };
}

/**
 * Find all operations that reference a specific wire.
 * Used to determine whether removal requires user confirmation.
 */
export function getDependentOperations(
  circuit: CircuitModel,
  wireType: WireType,
  index: number,
): Operation[] {
  return circuit.operations.filter((op) => {
    if (wireType === 'qubit') {
      return op.targets.qubits.includes(index);
    }
    return op.targets.clbits?.includes(index) ?? false;
  });
}

/**
 * Remap wire indices after removing a wire at the given index.
 * Indices above the removed index are decremented by one.
 * Returns null if the operation should be removed (targets the removed wire).
 */
function remapOperationIndices(
  op: Operation,
  wireType: WireType,
  removedIndex: number,
): Operation | null {
  const remap = (indices: number[]): number[] | null => {
    if (indices.includes(removedIndex)) return null;
    return indices.map((i) => (i > removedIndex ? i - 1 : i));
  };

  if (wireType === 'qubit') {
    const remapped = remap(op.targets.qubits);
    if (!remapped) return null;
    return { ...op, targets: { ...op.targets, qubits: remapped } };
  }

  const clbits = op.targets.clbits;
  if (!clbits) return op;
  const remapped = remap(clbits);
  if (!remapped) return null;
  return { ...op, targets: { ...op.targets, clbits: remapped } };
}

/**
 * Remove a wire and all operations that depend on it.
 * Remaining operations have their wire indices remapped.
 *
 * The UI layer should call `getDependentOperations()` first and show
 * a confirmation dialog if any dependents exist before calling this.
 */
export function removeWireWithDependents(
  circuit: CircuitModel,
  wireType: WireType,
  index: number,
): WireRemovalResult {
  const wireCount = wireType === 'qubit' ? circuit.qubits : circuit.clbits;
  if (index < 0 || index >= wireCount) {
    throw new RangeError(
      `Cannot remove ${wireType} at index ${index}: only ${wireCount} ${wireType}(s) exist`,
    );
  }

  const removedOperations: Operation[] = [];
  const survivingOperations: Operation[] = [];

  for (const op of circuit.operations) {
    const remapped = remapOperationIndices(op, wireType, index);
    if (remapped) {
      survivingOperations.push(remapped);
    } else {
      removedOperations.push(op);
    }
  }

  const updated: CircuitModel = {
    ...circuit,
    qubits: wireType === 'qubit' ? circuit.qubits - 1 : circuit.qubits,
    clbits: wireType === 'clbit' ? circuit.clbits - 1 : circuit.clbits,
    operations: survivingOperations,
  };

  return { circuit: updated, removedOperations };
}

/** Generate a unique operation ID. */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Place a gate on the circuit at the specified time column.
 * Returns the updated circuit and the newly created operation.
 */
export function placeGate(
  circuit: CircuitModel,
  type: GateType,
  targets: OperationTargets,
  time: number,
): { circuit: CircuitModel; operation: Operation } {
  validateGateTargets(circuit, type, targets);

  if (!Number.isInteger(time) || time < 0) {
    throw new RangeError(`Time must be a non-negative integer, got ${time}`);
  }

  const operation: Operation = {
    id: generateId(),
    type,
    targets: {
      qubits: [...targets.qubits],
      clbits: targets.clbits ? [...targets.clbits] : undefined,
    },
    time,
  };

  return {
    circuit: { ...circuit, operations: [...circuit.operations, operation] },
    operation,
  };
}

/** Move an existing operation to a new time column. */
export function moveGate(
  circuit: CircuitModel,
  operationId: string,
  newTime: number,
): CircuitModel {
  if (!Number.isInteger(newTime) || newTime < 0) {
    throw new RangeError(`Time must be a non-negative integer, got ${newTime}`);
  }

  const index = circuit.operations.findIndex((op) => op.id === operationId);
  if (index === -1) {
    throw new Error(`Operation ${operationId} not found`);
  }

  const operations = circuit.operations.map((op) =>
    op.id === operationId ? { ...op, time: newTime } : op,
  );

  return { ...circuit, operations };
}

/** Delete an operation from the circuit by ID. */
export function deleteGate(circuit: CircuitModel, operationId: string): CircuitModel {
  const index = circuit.operations.findIndex((op) => op.id === operationId);
  if (index === -1) {
    throw new Error(`Operation ${operationId} not found`);
  }

  return {
    ...circuit,
    operations: circuit.operations.filter((op) => op.id !== operationId),
  };
}

/** Validate that gate targets are consistent with the gate type and circuit dimensions. */
function validateGateTargets(
  circuit: CircuitModel,
  type: GateType,
  targets: OperationTargets,
): void {
  const requiredQubits = GATE_QUBIT_COUNT[type];

  if (targets.qubits.length !== requiredQubits) {
    throw new Error(
      `${type} requires ${requiredQubits} qubit(s), got ${targets.qubits.length}`,
    );
  }

  for (const q of targets.qubits) {
    if (!Number.isInteger(q) || q < 0 || q >= circuit.qubits) {
      throw new RangeError(`Qubit index ${q} is out of range (0–${circuit.qubits - 1})`);
    }
  }

  if (type === 'CX' && targets.qubits[0] === targets.qubits[1]) {
    throw new Error('CX requires two distinct qubit indices');
  }

  if (GATE_REQUIRES_CLBITS[type]) {
    const clbits = targets.clbits;
    if (!clbits || clbits.length !== 1) {
      throw new Error(`${type} requires exactly 1 classical bit target`);
    }
    for (const c of clbits) {
      if (!Number.isInteger(c) || c < 0 || c >= circuit.clbits) {
        throw new RangeError(`Classical bit index ${c} is out of range (0–${circuit.clbits - 1})`);
      }
    }
  }
}
