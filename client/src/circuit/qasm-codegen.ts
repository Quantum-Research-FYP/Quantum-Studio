import type { CircuitModel, GateType, Operation } from './types';
import { formatAngleQasm } from './angle-format';

/**
 * Map from gate type to OpenQASM 2.0 gate name for standard qelib1.inc gates.
 * Parameterized and non-standard gates are handled inline in emitOperation.
 */
const QASM_GATE: Partial<Record<GateType, string>> = {
  H: 'h', X: 'x', Y: 'y', Z: 'z',
  S: 's', SDG: 'sdg', T: 't', TDG: 'tdg',
  ID: 'id',
  CX: 'cx', CZ: 'cz', CY: 'cy', CH: 'ch', SWAP: 'swap',
  CRZ: 'crz',
  CCX: 'ccx', CSWAP: 'cswap',
};

/**
 * Inline gate definitions required for non-standard gates.
 * Keyed by gate type; definition emitted once per circuit when the gate is used.
 */
const EXTRA_GATE_DEFS: Partial<Record<GateType, string>> = {
  SX:   'gate sx a { u3(pi/2,-pi/2,pi/2) a; }',
  SXDG: 'gate sxdg a { u3(-pi/2,pi/2,-pi/2) a; }',
  CRX:  'gate crx(theta) c,t { h t; crz(theta) c,t; h t; }',
  CRY:  'gate cry(theta) c,t { u3(theta/2,0,0) t; cx c,t; u3(-theta/2,0,0) t; cx c,t; }',
};

/**
 * Generate deterministic OpenQASM 2.0 code from a CircuitModel.
 *
 * The output is byte-for-byte stable for the same circuit model:
 * operations are sorted by (time, id) before emission.
 */
export function generateOpenQasm(circuit: CircuitModel): string {
  if (circuit.qubits === 0) return '';

  const lines: string[] = [];
  lines.push('OPENQASM 2.0;');
  lines.push('include "qelib1.inc";');

  // Emit inline gate definitions for non-standard gates used in this circuit
  const usedTypes = new Set(circuit.operations.map((op) => op.type));
  const extraDefs: string[] = [];
  for (const [gate, def] of Object.entries(EXTRA_GATE_DEFS) as [GateType, string][]) {
    if (usedTypes.has(gate)) extraDefs.push(def);
  }
  if (extraDefs.length > 0) {
    lines.push('');
    extraDefs.forEach((d) => lines.push(d));
  }

  lines.push('');
  lines.push(`qreg q[${circuit.qubits}];`);
  if (circuit.clbits > 0) lines.push(`creg c[${circuit.clbits}];`);

  const sorted = [...circuit.operations].sort(compareOperations);
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
  const q = op.targets.qubits;
  const f = formatAngleQasm;

  switch (op.type) {
    // Standard single-qubit gates
    case 'H': case 'X': case 'Y': case 'Z':
    case 'S': case 'SDG': case 'T': case 'TDG':
    case 'SX': case 'SXDG': case 'ID':
      return `${QASM_GATE[op.type]} q[${q[0]}];`;

    // Parameterized single-qubit
    case 'RX': return `rx(${f(getParam(op, 'theta', Math.PI / 2))}) q[${q[0]}];`;
    case 'RY': return `ry(${f(getParam(op, 'theta', Math.PI / 2))}) q[${q[0]}];`;
    case 'RZ': return `rz(${f(getParam(op, 'theta', Math.PI / 4))}) q[${q[0]}];`;
    // P gate = u1 in standard qelib1.inc (equivalent up to global phase)
    case 'P':  return `u1(${f(getParam(op, 'lambda', Math.PI / 4))}) q[${q[0]}];`;
    // U gate = u3 in standard qelib1.inc
    case 'U':  return `u3(${f(getParam(op, 'theta', Math.PI / 2))},${f(getParam(op, 'phi', 0))},${f(getParam(op, 'lambda', Math.PI))}) q[${q[0]}];`;

    // Standard 2-qubit gates
    case 'CX': case 'CZ': case 'CY': case 'CH': case 'SWAP':
      return `${QASM_GATE[op.type]} q[${q[0]}],q[${q[1]}];`;

    // Parameterized 2-qubit
    case 'CRX': return `crx(${f(getParam(op, 'theta', Math.PI / 2))}) q[${q[0]}],q[${q[1]}];`;
    case 'CRY': return `cry(${f(getParam(op, 'theta', Math.PI / 2))}) q[${q[0]}],q[${q[1]}];`;
    case 'CRZ': return `crz(${f(getParam(op, 'theta', Math.PI / 4))}) q[${q[0]}],q[${q[1]}];`;
    // CP = cu1 in standard qelib1.inc
    case 'CP':  return `cu1(${f(getParam(op, 'lambda', Math.PI / 4))}) q[${q[0]}],q[${q[1]}];`;

    // 3-qubit
    case 'CCX':   return `ccx q[${q[0]}],q[${q[1]}],q[${q[2]}];`;
    case 'CSWAP': return `cswap q[${q[0]}],q[${q[1]}],q[${q[2]}];`;

    // Measurement
    case 'MEASURE': return `measure q[${q[0]}] -> c[${op.targets.clbits![0]}];`;
  }
}
