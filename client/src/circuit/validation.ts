import type { CircuitModel, WireType } from './types';
import { GATE_QUBIT_COUNT, GATE_REQUIRES_CLBITS } from './types';

/** A structured validation error with location context. */
export interface ValidationError {
  /** Human-readable error message. */
  message: string;
  /** The operation that caused the error, if applicable. */
  operationId?: string;
  /** Wire type involved in the error. */
  wireType?: WireType;
  /** Wire index involved in the error. */
  wireIndex?: number;
  /** Time column of the problematic operation. */
  time?: number;
}

/**
 * Validate a circuit model and return all errors.
 *
 * This function is pure, deterministic, and side-effect-free.
 * It checks all v1 rules:
 * - Qubit indices must exist (0 ≤ index < circuit.qubits)
 * - Classical bit indices must exist (0 ≤ index < circuit.clbits)
 * - MEASURE must map exactly 1 qubit to exactly 1 classical bit
 * - CX must target exactly 2 distinct qubits
 * - Gate qubit count must match the gate type's requirement
 * - Operation IDs must be unique
 */
export function validateCircuit(circuit: CircuitModel): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Set<string>();

  for (const op of circuit.operations) {
    // Duplicate ID check
    if (seenIds.has(op.id)) {
      errors.push({
        message: `Duplicate operation ID "${op.id}"`,
        operationId: op.id,
        time: op.time,
      });
    }
    seenIds.add(op.id);

    // Qubit count check
    const requiredQubits = GATE_QUBIT_COUNT[op.type];
    if (op.targets.qubits.length !== requiredQubits) {
      errors.push({
        message: `${op.type} at time ${op.time} requires ${requiredQubits} qubit(s), has ${op.targets.qubits.length}`,
        operationId: op.id,
        time: op.time,
      });
      continue; // Skip further checks on this operation — target array is wrong shape
    }

    // Qubit index range checks
    for (const q of op.targets.qubits) {
      if (q < 0 || q >= circuit.qubits) {
        errors.push({
          message: `${op.type} at time ${op.time} references qubit ${q}, but circuit only has ${circuit.qubits} qubit(s)`,
          operationId: op.id,
          wireType: 'qubit',
          wireIndex: q,
          time: op.time,
        });
      }
    }

    // CX distinct qubits check
    if (op.type === 'CX' && op.targets.qubits[0] === op.targets.qubits[1]) {
      errors.push({
        message: `CX at time ${op.time} must target two distinct qubits, both are qubit ${op.targets.qubits[0]}`,
        operationId: op.id,
        time: op.time,
      });
    }

    // Classical bit checks for gates that require them
    if (GATE_REQUIRES_CLBITS[op.type]) {
      const clbits = op.targets.clbits;
      if (!clbits || clbits.length !== 1) {
        errors.push({
          message: `${op.type} at time ${op.time} requires exactly 1 classical bit target, has ${clbits?.length ?? 0}`,
          operationId: op.id,
          time: op.time,
        });
      } else {
        for (const c of clbits) {
          if (c < 0 || c >= circuit.clbits) {
            errors.push({
              message: `${op.type} at time ${op.time} references classical bit ${c}, but circuit only has ${circuit.clbits} classical bit(s)`,
              operationId: op.id,
              wireType: 'clbit',
              wireIndex: c,
              time: op.time,
            });
          }
        }
      }
    }
  }

  return errors;
}
