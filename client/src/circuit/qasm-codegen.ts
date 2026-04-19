import type { CircuitModel, Operation } from './types';

/**
 * Map from gate type to the OpenQASM 2.0 gate name.
 * These match the gates defined in qelib1.inc.
 */
const QASM_GATE: Record<string, string> = {
  H: 'h',
  X: 'x',
  Y: 'y',
  Z: 'z',
  S: 's',
  T: 't',
  CX: 'cx',
};

/**
 * Generate deterministic OpenQASM 2.0 code from a CircuitModel.
 *
 * The output is byte-for-byte stable for the same circuit model:
 * operations are sorted by (time, id) before emission.
 *
 * This function is pure and side-effect-free.
 */
export function generateOpenQasm(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '';
  }

  const lines: string[] = [];

  // Header
  lines.push('OPENQASM 2.0;');
  lines.push('include "qelib1.inc";');
  lines.push('');

  // Register declarations
  lines.push(`qreg q[${circuit.qubits}];`);
  if (circuit.clbits > 0) {
    lines.push(`creg c[${circuit.clbits}];`);
  }

  // Sort operations by time, then by id for deterministic ordering
  const sorted = [...circuit.operations].sort(compareOperations);

  if (sorted.length > 0) {
    lines.push('');
    for (const op of sorted) {
      lines.push(emitOperation(op));
    }
  }

  // Trailing newline
  lines.push('');

  return lines.join('\n');
}

function compareOperations(a: Operation, b: Operation): number {
  if (a.time !== b.time) return a.time - b.time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function emitOperation(op: Operation): string {
  switch (op.type) {
    case 'H':
    case 'X':
    case 'Y':
    case 'Z':
    case 'S':
    case 'T':
      return `${QASM_GATE[op.type]} q[${op.targets.qubits[0]}];`;

    case 'CX':
      return `cx q[${op.targets.qubits[0]}],q[${op.targets.qubits[1]}];`;

    case 'MEASURE':
      return `measure q[${op.targets.qubits[0]}] -> c[${op.targets.clbits![0]}];`;
  }
}
