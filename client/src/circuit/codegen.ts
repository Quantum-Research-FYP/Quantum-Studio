import type { CircuitModel, GateType, Operation } from './types';
import { PARAMETERIZED_GATES } from './types';
import { formatAngleQiskit } from './angle-format';

/** Map from gate type to the Qiskit method name (non-parameterized gates only). */
const QISKIT_METHOD: Partial<Record<GateType, string>> = {
  H: 'h', X: 'x', Y: 'y', Z: 'z',
  S: 's', SDG: 'sdg', T: 't', TDG: 'tdg',
  SX: 'sx', SXDG: 'sxdg', ID: 'id',
  CX: 'cx', CZ: 'cz', CY: 'cy', CH: 'ch', SWAP: 'swap',
  CRZ: 'crz',
  CCX: 'ccx', CSWAP: 'cswap',
  MEASURE: 'measure',
};

/**
 * Generate deterministic Qiskit Python code from a CircuitModel.
 *
 * The output is byte-for-byte stable for the same circuit model:
 * operations are sorted by (time, id) before emission.
 */
export function generateQiskitCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate Qiskit code';
  }

  const lines: string[] = [];
  const sorted = [...circuit.operations].sort(compareOperations);
  const needsMath = sorted.some((op) => PARAMETERIZED_GATES.has(op.type));

  lines.push('from qiskit import QuantumCircuit');
  if (needsMath) lines.push('import math');
  lines.push('');

  if (circuit.clbits > 0) {
    lines.push(`qc = QuantumCircuit(${circuit.qubits}, ${circuit.clbits})`);
  } else {
    lines.push(`qc = QuantumCircuit(${circuit.qubits})`);
  }

  if (sorted.length > 0) {
    lines.push('');
    for (const op of sorted) {
      lines.push(emitOperation(op));
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate Qiskit Python code with statevector snapshots for each time step.
 */
export function generateStepperQiskitCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate Qiskit code';
  }

  const lines: string[] = [];
  const sorted = [...circuit.operations].sort(compareOperations);
  const needsMath = sorted.some((op) => PARAMETERIZED_GATES.has(op.type));

  lines.push('from qiskit import QuantumCircuit');
  lines.push('import qiskit_aer');
  if (needsMath) lines.push('import math');
  lines.push('');

  if (circuit.clbits > 0) {
    lines.push(`qc = QuantumCircuit(${circuit.qubits}, ${circuit.clbits})`);
  } else {
    lines.push(`qc = QuantumCircuit(${circuit.qubits})`);
  }

  lines.push('');
  lines.push('qc.save_statevector(label="step_0")');

  if (sorted.length > 0) {
    const maxTime = Math.max(...sorted.map(op => op.time));
    
    let opIndex = 0;
    for (let t = 0; t <= maxTime; t++) {
      let emitted = false;
      while (opIndex < sorted.length && sorted[opIndex].time === t) {
        lines.push(emitOperation(sorted[opIndex]));
        opIndex++;
        emitted = true;
      }
      lines.push(`qc.save_statevector(label="step_${t + 1}")`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function compareOperations(a: Operation, b: Operation): number {
  if (a.time !== b.time) return a.time - b.time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function getParam(op: Operation, key: string, fallback: number): number {
  return (op.params?.[key] as number | undefined) ?? fallback;
}

function emitOperation(op: Operation): string {
  const q = op.targets.qubits;
  const f = formatAngleQiskit;

  switch (op.type) {
    // Non-parameterized single-qubit
    case 'H': case 'X': case 'Y': case 'Z':
    case 'S': case 'SDG': case 'T': case 'TDG':
    case 'SX': case 'SXDG': case 'ID':
      return `qc.${QISKIT_METHOD[op.type]}(${q[0]})`;

    // Parameterized single-qubit (1 angle)
    case 'RX': return `qc.rx(${f(getParam(op, 'theta', Math.PI / 2))}, ${q[0]})`;
    case 'RY': return `qc.ry(${f(getParam(op, 'theta', Math.PI / 2))}, ${q[0]})`;
    case 'RZ': return `qc.rz(${f(getParam(op, 'theta', Math.PI / 4))}, ${q[0]})`;
    case 'P':  return `qc.p(${f(getParam(op, 'lambda', Math.PI / 4))}, ${q[0]})`;
    case 'U':  return `qc.u(${f(getParam(op, 'theta', Math.PI / 2))}, ${f(getParam(op, 'phi', 0))}, ${f(getParam(op, 'lambda', Math.PI))}, ${q[0]})`;

    // Non-parameterized 2-qubit
    case 'CX': case 'CZ': case 'CY': case 'CH': case 'SWAP':
      return `qc.${QISKIT_METHOD[op.type]}(${q[0]}, ${q[1]})`;

    // Parameterized 2-qubit
    case 'CRX': return `qc.crx(${f(getParam(op, 'theta', Math.PI / 2))}, ${q[0]}, ${q[1]})`;
    case 'CRY': return `qc.cry(${f(getParam(op, 'theta', Math.PI / 2))}, ${q[0]}, ${q[1]})`;
    case 'CRZ': return `qc.crz(${f(getParam(op, 'theta', Math.PI / 4))}, ${q[0]}, ${q[1]})`;
    case 'CP':  return `qc.cp(${f(getParam(op, 'lambda', Math.PI / 4))}, ${q[0]}, ${q[1]})`;

    // 3-qubit
    case 'CCX':   return `qc.ccx(${q[0]}, ${q[1]}, ${q[2]})`;
    case 'CSWAP': return `qc.cswap(${q[0]}, ${q[1]}, ${q[2]})`;

    // Measurement
    case 'MEASURE': return `qc.measure(${q[0]}, ${op.targets.clbits![0]})`;
  }
}
