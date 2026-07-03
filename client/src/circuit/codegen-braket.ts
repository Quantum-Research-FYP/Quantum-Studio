import type { CircuitModel, GateType, Operation } from './types';
import { PARAMETERIZED_GATES } from './types';
import { formatAngleQiskit } from './angle-format'; 

const BRAKET_METHOD: Partial<Record<GateType, string>> = {
  H: 'h', X: 'x', Y: 'y', Z: 'z',
  S: 's', T: 't',
  CX: 'cnot', CZ: 'cz', CY: 'cy', SWAP: 'swap',
  CCX: 'ccnot', CSWAP: 'cswap',
};

export function generateBraketCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate Amazon Braket code';
  }

  const lines: string[] = [];
  const sorted = [...circuit.operations].sort(compareOperations);
  const needsMath = sorted.some((op) => PARAMETERIZED_GATES.has(op.type));

  lines.push('from braket.circuits import Circuit');
  if (needsMath) lines.push('import math');
  lines.push('');

  lines.push('circuit = Circuit()');

  if (sorted.length > 0) {
    lines.push('');
    for (const op of sorted) {
      if (op.type !== 'MEASURE') {
        lines.push(emitOperation(op));
      }
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
    case 'S': case 'T':
      return `circuit.${BRAKET_METHOD[op.type]}(${q[0]})`;
    case 'SDG': return `circuit.si(${q[0]})`;
    case 'TDG': return `circuit.ti(${q[0]})`;
    case 'SX': return `circuit.v(${q[0]})`; // V gate is sqrt(X)
    case 'SXDG': return `circuit.vi(${q[0]})`;
    case 'ID': return `circuit.i(${q[0]})`;

    // Parameterized single-qubit
    case 'RX': return `circuit.rx(${q[0]}, ${f(getParam(op, 'theta', Math.PI / 2))})`;
    case 'RY': return `circuit.ry(${q[0]}, ${f(getParam(op, 'theta', Math.PI / 2))})`;
    case 'RZ': return `circuit.rz(${q[0]}, ${f(getParam(op, 'theta', Math.PI / 4))})`;
    case 'P':  return `circuit.phaseshift(${q[0]}, ${f(getParam(op, 'lambda', Math.PI / 4))})`;
    case 'U':  
      // Decompose U gate for Braket
      return `circuit.rz(${q[0]}, ${f(getParam(op, 'phi', 0))}).ry(${q[0]}, ${f(getParam(op, 'theta', Math.PI / 2))}).rz(${q[0]}, ${f(getParam(op, 'lambda', Math.PI))})`;

    // Non-parameterized 2-qubit
    case 'CX': case 'CZ': case 'CY': case 'SWAP':
      return `circuit.${BRAKET_METHOD[op.type]}(${q[0]}, ${q[1]})`;
    case 'CH': return `# Braket doesn't have native CH\ncircuit.ry(${q[1]}, math.pi/4).cx(${q[0]}, ${q[1]}).ry(${q[1]}, -math.pi/4)`; // Approximation of CH

    // Parameterized 2-qubit
    case 'CRX': return `# Braket doesn't have native CRX\ncircuit.rz(${q[1]}, math.pi/2).ry(${q[1]}, ${f(getParam(op, 'theta', Math.PI / 2))}/2).cx(${q[0]}, ${q[1]}).ry(${q[1]}, -${f(getParam(op, 'theta', Math.PI / 2))}/2).cx(${q[0]}, ${q[1]}).rz(${q[1]}, -math.pi/2)`;
    case 'CRY': return `# Braket doesn't have native CRY\ncircuit.ry(${q[1]}, ${f(getParam(op, 'theta', Math.PI / 2))}/2).cx(${q[0]}, ${q[1]}).ry(${q[1]}, -${f(getParam(op, 'theta', Math.PI / 2))}/2).cx(${q[0]}, ${q[1]})`;
    case 'CRZ': return `# Braket doesn't have native CRZ\ncircuit.rz(${q[1]}, ${f(getParam(op, 'theta', Math.PI / 4))}/2).cx(${q[0]}, ${q[1]}).rz(${q[1]}, -${f(getParam(op, 'theta', Math.PI / 4))}/2).cx(${q[0]}, ${q[1]})`;
    case 'CP':  return `circuit.cphaseshift(${q[0]}, ${q[1]}, ${f(getParam(op, 'lambda', Math.PI / 4))})`;

    // 3-qubit
    case 'CCX':   case 'CSWAP':
      return `circuit.${BRAKET_METHOD[op.type]}(${q[0]}, ${q[1]}, ${q[2]})`;
    
    default: return `# Unsupported gate ${op.type} in Braket`;
  }
}
