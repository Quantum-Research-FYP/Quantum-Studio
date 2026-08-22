import type { CircuitModel, GateType, Operation } from './types';
import { PARAMETERIZED_GATES } from './types';
import { formatAngleQiskit } from './angle-format';

const SPINQIT_GATES: Partial<Record<GateType, string>> = {
  H: 'H', X: 'X', Y: 'Y', Z: 'Z',
  S: 'S', T: 'T',
  RX: 'Rx', RY: 'Ry', RZ: 'Rz', P: 'P', U: 'U',
  CX: 'CX', CZ: 'CZ', CY: 'CY', SWAP: 'SWAP',
  CCX: 'CCX',
  MEASURE: 'Measure',
};

export function generateSpinqitCode(circuit: CircuitModel): string {
  if (circuit.qubits === 0) {
    return '# Add qubits and gates to generate SpinQit code';
  }

  const lines: string[] = [];
  const sorted = [...circuit.operations].sort(compareOperations);
  const needsMath = sorted.some((op) => PARAMETERIZED_GATES.has(op.type));

  const usedGates = new Set<string>();
  for (const op of sorted) {
    const gateName = SPINQIT_GATES[op.type];
    if (gateName && op.type !== 'MEASURE') {
      usedGates.add(gateName);
    }
  }

  if (usedGates.size > 0) {
    lines.push(`from spinqit import Circuit, ${Array.from(usedGates).sort().join(', ')}`);
  } else {
    lines.push('from spinqit import Circuit');
  }

  if (needsMath) lines.push('import math');
  lines.push('');

  lines.push('circ = Circuit()');
  lines.push(`q = circ.allocateQubits(${circuit.qubits})`);
  lines.push('');

  if (sorted.length > 0) {
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
  const gateName = SPINQIT_GATES[op.type];
  if (!gateName) {
    return `# Warning: ${op.type} is not natively supported in this exporter`;
  }

  const q = op.targets.qubits;
  
  if (q.length === 1) {
    if (PARAMETERIZED_GATES.has(op.type)) {
      if (op.type === 'U') {
        const theta = formatAngleQiskit(getParam(op, 'theta', 0));
        const phi = formatAngleQiskit(getParam(op, 'phi', 0));
        const lam = formatAngleQiskit(getParam(op, 'lam', 0));
        return `circ << (${gateName}, q[${q[0]}], ${theta}, ${phi}, ${lam})`;
      } else {
        const theta = formatAngleQiskit(getParam(op, 'theta', 0));
        return `circ << (${gateName}, q[${q[0]}], ${theta})`;
      }
    }
    return `circ << (${gateName}, q[${q[0]}])`;
  } else if (q.length === 2) {
    if (PARAMETERIZED_GATES.has(op.type)) {
      const theta = formatAngleQiskit(getParam(op, 'theta', 0));
      return `circ << (${gateName}, (q[${q[0]}], q[${q[1]}]), ${theta})`;
    }
    return `circ << (${gateName}, (q[${q[0]}], q[${q[1]}]))`;
  } else if (q.length === 3) {
    return `circ << (${gateName}, (q[${q[0]}], q[${q[1]}], q[${q[2]}]))`;
  }

  return `# Warning: Invalid target count for ${op.type}`;
}
