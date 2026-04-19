import type { CircuitModel, GateType, Operation } from './types';

/**
 * Map from gate type to the Qiskit method name.
 * Single-qubit gates use lowercase; CX maps to cx; MEASURE maps to measure.
 */
const QISKIT_METHOD: Record<GateType, string> = {
  H: 'h',
  X: 'x',
  Y: 'y',
  Z: 'z',
  S: 's',
  T: 't',
  CX: 'cx',
  MEASURE: 'measure',
};

/**
 * Generate deterministic Qiskit Python code from a CircuitModel.
 *
 * The output is byte-for-byte stable for the same circuit model:
 * operations are sorted by (time, id) before emission.
 *
 * This function is pure and side-effect-free.
 */
export function generateQiskitCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate Qiskit code';
  }

  const lines: string[] = [];

  // Imports
  lines.push('from qiskit import QuantumCircuit');
  lines.push('');

  // Circuit construction
  if (circuit.clbits > 0) {
    lines.push(`qc = QuantumCircuit(${circuit.qubits}, ${circuit.clbits})`);
  } else {
    lines.push(`qc = QuantumCircuit(${circuit.qubits})`);
  }

  // Sort operations by time, then by id for deterministic ordering
  const sorted = [...circuit.operations].sort(compareOperations);

  // Emit gate operations
  if (sorted.length > 0) {
    lines.push('');
    for (const op of sorted) {
      lines.push(emitOperation(op));
    }
  }

  // Trailing newline for well-formed Python files
  lines.push('');

  return lines.join('\n');
}

/** Compare operations by time first, then by id for stable ordering. */
function compareOperations(a: Operation, b: Operation): number {
  if (a.time !== b.time) return a.time - b.time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Emit a single operation as a Qiskit Python statement. */
function emitOperation(op: Operation): string {
  const method = QISKIT_METHOD[op.type];

  switch (op.type) {
    case 'H':
    case 'X':
    case 'Y':
    case 'Z':
    case 'S':
    case 'T':
      return `qc.${method}(${op.targets.qubits[0]})`;

    case 'CX':
      return `qc.${method}(${op.targets.qubits[0]}, ${op.targets.qubits[1]})`;

    case 'MEASURE':
      return `qc.${method}(${op.targets.qubits[0]}, ${op.targets.clbits![0]})`;
  }
}
