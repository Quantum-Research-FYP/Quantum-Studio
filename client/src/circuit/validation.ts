import type { CircuitModel, WireType } from './types';
import { GATE_QUBIT_COUNT, GATE_REQUIRES_CLBITS } from './types';

/** A structured validation error with location context. */
export interface ValidationError {
  message: string;
  operationId?: string;
  wireType?: WireType;
  wireIndex?: number;
  time?: number;
}

/**
 * Validate a circuit model and return all errors.
 *
 * Checks:
 * - Unique operation IDs
 * - Correct qubit count per gate type
 * - Qubit indices within bounds
 * - Classical bit indices within bounds (for MEASURE)
 * - All 2-qubit gates target 2 distinct qubits
 * - All 3-qubit gates target 3 distinct qubits
 */
export function validateCircuit(circuit: CircuitModel): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Set<string>();

  for (const op of circuit.operations) {
    if (seenIds.has(op.id)) {
      errors.push({
        message: `Duplicate operation ID "${op.id}"`,
        operationId: op.id,
        time: op.time,
      });
    }
    seenIds.add(op.id);

    const requiredQubits = GATE_QUBIT_COUNT[op.type];
    if (op.targets.qubits.length !== requiredQubits) {
      errors.push({
        message: `${op.type} at time ${op.time} requires ${requiredQubits} qubit(s), has ${op.targets.qubits.length}`,
        operationId: op.id,
        time: op.time,
      });
      continue;
    }

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

    // 2-qubit gates: distinct qubits
    if (requiredQubits === 2 && op.targets.qubits[0] === op.targets.qubits[1]) {
      errors.push({
        message: `${op.type} at time ${op.time} must target two distinct qubits`,
        operationId: op.id,
        time: op.time,
      });
    }

    // 3-qubit gates: all three distinct
    if (requiredQubits === 3) {
      const [q0, q1, q2] = op.targets.qubits;
      if (q0 === q1 || q0 === q2 || q1 === q2) {
        errors.push({
          message: `${op.type} at time ${op.time} must target three distinct qubits`,
          operationId: op.id,
          time: op.time,
        });
      }
    }

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
