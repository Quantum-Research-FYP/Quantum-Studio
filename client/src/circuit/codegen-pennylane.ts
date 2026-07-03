import type { CircuitModel, GateType, Operation } from './types';
import { PARAMETERIZED_GATES } from './types';
import { formatAngleQiskit } from './angle-format'; 

const PENNYLANE_METHOD: Partial<Record<GateType, string>> = {
  H: 'Hadamard', X: 'PauliX', Y: 'PauliY', Z: 'PauliZ',
  S: 'S', T: 'T', SX: 'SX',
  CX: 'CNOT', CZ: 'CZ', CY: 'CY', CH: 'CH', SWAP: 'SWAP',
  CCX: 'Toffoli', CSWAP: 'CSWAP',
};

export function generatePennyLaneCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate PennyLane code';
  }

  const lines: string[] = [];
  const sorted = [...circuit.operations].sort(compareOperations);
  const needsMath = sorted.some((op) => PARAMETERIZED_GATES.has(op.type));

  lines.push('import pennylane as qml');
  if (needsMath) lines.push('import math');
  lines.push('');

  lines.push(`dev = qml.device("default.qubit", wires=${circuit.qubits})`);
  lines.push('');
  lines.push('@qml.qnode(dev)');
  lines.push('def circuit():');

  if (sorted.length === 0) {
    lines.push('    return qml.state()');
    return lines.join('\n');
  }

  let hasMeasure = false;
  const measuredQubits = new Set<number>();

  for (const op of sorted) {
    if (op.type === 'MEASURE') {
      hasMeasure = true;
      measuredQubits.add(op.targets.qubits[0]);
    } else {
      lines.push(`    ${emitOperation(op)}`);
    }
  }

  if (hasMeasure) {
    const measStr = Array.from(measuredQubits).map(q => `qml.probs(wires=[${q}])`).join(', ');
    lines.push(`    return ${measStr}`);
  } else {
    lines.push('    return qml.state()');
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
    case 'S': case 'T': case 'SX':
      return `qml.${PENNYLANE_METHOD[op.type]}(wires=[${q[0]}])`;
    case 'SDG': return `qml.adjoint(qml.S)(wires=[${q[0]}])`;
    case 'TDG': return `qml.adjoint(qml.T)(wires=[${q[0]}])`;
    case 'SXDG': return `qml.adjoint(qml.SX)(wires=[${q[0]}])`;
    case 'ID': return `qml.Identity(wires=[${q[0]}])`;

    // Parameterized single-qubit
    case 'RX': return `qml.RX(${f(getParam(op, 'theta', Math.PI / 2))}, wires=[${q[0]}])`;
    case 'RY': return `qml.RY(${f(getParam(op, 'theta', Math.PI / 2))}, wires=[${q[0]}])`;
    case 'RZ': return `qml.RZ(${f(getParam(op, 'theta', Math.PI / 4))}, wires=[${q[0]}])`;
    case 'P':  return `qml.PhaseShift(${f(getParam(op, 'lambda', Math.PI / 4))}, wires=[${q[0]}])`;
    case 'U':  return `qml.U3(${f(getParam(op, 'theta', Math.PI / 2))}, ${f(getParam(op, 'phi', 0))}, ${f(getParam(op, 'lambda', Math.PI))}, wires=[${q[0]}])`;

    // Non-parameterized 2-qubit
    case 'CX': case 'CZ': case 'CY': case 'CH': case 'SWAP':
      return `qml.${PENNYLANE_METHOD[op.type]}(wires=[${q[0]}, ${q[1]}])`;

    // Parameterized 2-qubit
    case 'CRX': return `qml.CRX(${f(getParam(op, 'theta', Math.PI / 2))}, wires=[${q[0]}, ${q[1]}])`;
    case 'CRY': return `qml.CRY(${f(getParam(op, 'theta', Math.PI / 2))}, wires=[${q[0]}, ${q[1]}])`;
    case 'CRZ': return `qml.CRZ(${f(getParam(op, 'theta', Math.PI / 4))}, wires=[${q[0]}, ${q[1]}])`;
    case 'CP':  return `qml.ControlledPhaseShift(${f(getParam(op, 'lambda', Math.PI / 4))}, wires=[${q[0]}, ${q[1]}])`;

    // 3-qubit
    case 'CCX':   case 'CSWAP':
      return `qml.${PENNYLANE_METHOD[op.type]}(wires=[${q[0]}, ${q[1]}, ${q[2]}])`;
    
    default: return `# Unsupported gate ${op.type} in PennyLane`;
  }
}
