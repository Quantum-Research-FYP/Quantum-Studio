import type { CircuitModel, GateType, Operation } from './types';
import { PARAMETERIZED_GATES } from './types';
import { formatAngleQiskit } from './angle-format';

const CIRQ_METHOD: Partial<Record<GateType, string>> = {
  H: 'cirq.H',
  X: 'cirq.X',
  Y: 'cirq.Y',
  Z: 'cirq.Z',
  S: 'cirq.S',
  T: 'cirq.T',
  CX: 'cirq.CNOT',
  CZ: 'cirq.CZ',
  SWAP: 'cirq.SWAP',
  CCX: 'cirq.CCX',
  CSWAP: 'cirq.CSWAP',
};

export function generateCirqCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate Cirq code';
  }

  const lines: string[] = [];
  const sorted = [...circuit.operations].sort(compareOperations);
  const needsMath = sorted.some((op) => PARAMETERIZED_GATES.has(op.type));

  lines.push('import cirq');
  if (needsMath) lines.push('import math');
  lines.push('');

  lines.push(`qubits = cirq.LineQubit.range(${circuit.qubits})`);
  lines.push('circuit = cirq.Circuit()');

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

function emitOperation(op: Operation): string {
  const q = op.targets.qubits.map((idx) => `qubits[${idx}]`);
  const f = formatAngleQiskit;

  switch (op.type) {
    // Non-parameterized single-qubit
    case 'H':
    case 'X':
    case 'Y':
    case 'Z':
    case 'S':
    case 'T':
      return `circuit.append(${CIRQ_METHOD[op.type]}(${q[0]}))`;
    case 'SDG':
      return `circuit.append(cirq.inverse(cirq.S(${q[0]})))`;
    case 'TDG':
      return `circuit.append(cirq.inverse(cirq.T(${q[0]})))`;
    case 'SX':
      return `circuit.append(cirq.XPowGate(exponent=0.5)(${q[0]}))`;
    case 'SXDG':
      return `circuit.append(cirq.XPowGate(exponent=-0.5)(${q[0]}))`;
    case 'ID':
      return `circuit.append(cirq.I(${q[0]}))`;

    // Parameterized single-qubit
    case 'RX':
      return `circuit.append(cirq.rx(${f(getParam(op, 'theta', Math.PI / 2))})(${q[0]}))`;
    case 'RY':
      return `circuit.append(cirq.ry(${f(getParam(op, 'theta', Math.PI / 2))})(${q[0]}))`;
    case 'RZ':
      return `circuit.append(cirq.rz(${f(getParam(op, 'theta', Math.PI / 4))})(${q[0]}))`;
    case 'P':
      return `circuit.append(cirq.ZPowGate(exponent=(${f(getParam(op, 'lambda', Math.PI / 4))})/math.pi)(${q[0]}))`;
    case 'U':
      // cirq does not have a single U gate, decompose or note it
      return (
        `circuit.append(cirq.rz(${f(getParam(op, 'phi', 0))})(${q[0]}))\n` +
        `circuit.append(cirq.ry(${f(getParam(op, 'theta', Math.PI / 2))})(${q[0]}))\n` +
        `circuit.append(cirq.rz(${f(getParam(op, 'lambda', Math.PI))})(${q[0]}))`
      );

    // Non-parameterized 2-qubit
    case 'CX':
    case 'CZ':
    case 'SWAP':
      return `circuit.append(${CIRQ_METHOD[op.type]}(${q[0]}, ${q[1]}))`;
    case 'CY':
      return `circuit.append(cirq.Y(${q[1]}).controlled_by(${q[0]}))`;
    case 'CH':
      return `circuit.append(cirq.H(${q[1]}).controlled_by(${q[0]}))`;

    // Parameterized 2-qubit
    case 'CRX':
      return `circuit.append(cirq.rx(${f(getParam(op, 'theta', Math.PI / 2))})(${q[1]}).controlled_by(${q[0]}))`;
    case 'CRY':
      return `circuit.append(cirq.ry(${f(getParam(op, 'theta', Math.PI / 2))})(${q[1]}).controlled_by(${q[0]}))`;
    case 'CRZ':
      return `circuit.append(cirq.rz(${f(getParam(op, 'theta', Math.PI / 4))})(${q[1]}).controlled_by(${q[0]}))`;
    case 'CP':
      return `circuit.append(cirq.ZPowGate(exponent=(${f(getParam(op, 'lambda', Math.PI / 4))})/math.pi)(${q[1]}).controlled_by(${q[0]}))`;

    // 3-qubit
    case 'CCX':
      return `circuit.append(cirq.CCX(${q[0]}, ${q[1]}, ${q[2]}))`;
    case 'CSWAP':
      return `circuit.append(cirq.CSWAP(${q[0]}, ${q[1]}, ${q[2]}))`;

    // Measurement
    case 'MEASURE':
      return `circuit.append(cirq.measure(${q[0]}, key='c${op.targets.clbits![0]}'))`;

    default:
      return `# Unsupported gate ${op.type} in Cirq`;
  }
}
