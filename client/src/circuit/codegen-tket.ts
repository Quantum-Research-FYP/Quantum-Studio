import type { CircuitModel, GateType, Operation } from './types';
import { PARAMETERIZED_GATES } from './types';

const TKET_METHOD: Partial<Record<GateType, string>> = {
  H: 'H', X: 'X', Y: 'Y', Z: 'Z',
  S: 'S', SDG: 'Sdg', T: 'T', TDG: 'Tdg',
  SX: 'V', SXDG: 'Vdg',
  CX: 'CX', CZ: 'CZ', CY: 'CY', CH: 'CH', SWAP: 'SWAP',
  CRX: 'CRx', CRY: 'CRy', CRZ: 'CRz', CP: 'CU1',
  CCX: 'CCX', CSWAP: 'CSWAP',
};

export function generateTketCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate TKET code';
  }

  const lines: string[] = [];
  const sorted = [...circuit.operations].sort(compareOperations);

  lines.push('from pytket import Circuit');
  lines.push('');

  if (circuit.clbits > 0) {
    lines.push(`circ = Circuit(${circuit.qubits}, ${circuit.clbits})`);
  } else {
    lines.push(`circ = Circuit(${circuit.qubits})`);
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

function compareOperations(a: Operation, b: Operation): number {
  if (a.time !== b.time) return a.time - b.time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function getParam(op: Operation, key: string, fallback: number): number {
  return (op.params?.[key] as number | undefined) ?? fallback;
}

function formatAngleTket(val: number): string {
  // TKET angles are in half-turns (units of pi)
  const halfTurns = val / Math.PI;
  return halfTurns.toString();
}

function emitOperation(op: Operation): string {
  const q = op.targets.qubits;
  const f = formatAngleTket; 

  switch (op.type) {
    // Non-parameterized single-qubit
    case 'H': case 'X': case 'Y': case 'Z':
    case 'S': case 'SDG': case 'T': case 'TDG':
    case 'SX': case 'SXDG':
      return `circ.${TKET_METHOD[op.type]}(${q[0]})`;
    case 'ID': return `# ID gate skipped (or use circ.noop(${q[0]}))`;

    // Parameterized single-qubit
    case 'RX': return `circ.Rx(${f(getParam(op, 'theta', Math.PI / 2))}, ${q[0]})`;
    case 'RY': return `circ.Ry(${f(getParam(op, 'theta', Math.PI / 2))}, ${q[0]})`;
    case 'RZ': return `circ.Rz(${f(getParam(op, 'theta', Math.PI / 4))}, ${q[0]})`;
    case 'P':  return `circ.U1(${f(getParam(op, 'lambda', Math.PI / 4))}, ${q[0]})`;
    case 'U':  return `circ.U3(${f(getParam(op, 'theta', Math.PI / 2))}, ${f(getParam(op, 'phi', 0))}, ${f(getParam(op, 'lambda', Math.PI))}, ${q[0]})`;

    // Non-parameterized 2-qubit
    case 'CX': case 'CZ': case 'CY': case 'CH': case 'SWAP':
      return `circ.${TKET_METHOD[op.type]}(${q[0]}, ${q[1]})`;

    // Parameterized 2-qubit
    case 'CRX': case 'CRY': case 'CRZ':
      return `circ.${TKET_METHOD[op.type]}(${f(getParam(op, 'theta', Math.PI / 4))}, ${q[0]}, ${q[1]})`;
    case 'CP':  
      return `circ.${TKET_METHOD[op.type]}(${f(getParam(op, 'lambda', Math.PI / 4))}, ${q[0]}, ${q[1]})`;

    // 3-qubit
    case 'CCX':   case 'CSWAP':
      return `circ.${TKET_METHOD[op.type]}(${q[0]}, ${q[1]}, ${q[2]})`;

    // Measurement
    case 'MEASURE': return `circ.Measure(${q[0]}, ${op.targets.clbits![0]})`;
    
    default: return `# Unsupported gate ${op.type} in TKET`;
  }
}
