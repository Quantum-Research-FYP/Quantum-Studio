/**
 * qasmToCircuitModel.ts
 *
 * Lightweight QASM 3 / QASM 2 → CircuitModel parser.
 * Handles the gate subset that Qiskit actually emits after transpilation.
 *
 * NOTE: This is intentionally minimal — it only needs to parse transpiled
 * Qiskit output (not arbitrary QASM). Full spec compliance is not a goal.
 */

import type { CircuitModel, GateType, Operation, OperationTargets } from './types';
import { GATE_TYPES } from './types';

// Maps QASM gate names → our GateType enum (handles Qiskit's naming differences)
const QASM_GATE_MAP: Record<string, GateType> = {
  h: 'H', x: 'X', y: 'Y', z: 'Z',
  s: 'S', sdg: 'SDG', t: 'T', tdg: 'TDG',
  sx: 'SX', sxdg: 'SXDG', id: 'ID',
  rx: 'RX', ry: 'RY', rz: 'RZ', p: 'P', u: 'U',
  cx: 'CX', cz: 'CZ', cy: 'CY', ch: 'CH', swap: 'SWAP',
  crx: 'CRX', cry: 'CRY', crz: 'CRZ', cp: 'CP',
  ccx: 'CCX', cswap: 'CSWAP',
  measure: 'MEASURE',
  // Qiskit aliases
  cnot: 'CX', toffoli: 'CCX', fredkin: 'CSWAP',
  ecr: 'CX',  // ECR is IBM native 2Q gate — visualize as CX-equivalent
  csx: 'CX',  // Controlled-SX — map to CX for display
  r: 'U',     // R gate maps to U
  u1: 'P', u2: 'U', u3: 'U',
};

let _opId = 0;
function nextId(): string {
  return `qasm-op-${_opId++}`;
}

/**
 * Parses a QASM string (v2 or v3) into a CircuitModel.
 * Returns an empty circuit on failure.
 */
export function qasmToCircuitModel(qasm: string): CircuitModel {
  _opId = 0;
  try {
    return _parse(qasm);
  } catch (e) {
    console.warn('[qasmToCircuitModel] parse error:', e);
    return { schemaVersion: 1, qubits: 0, clbits: 0, operations: [] };
  }
}

function _parse(qasm: string): CircuitModel {
  // Normalize: strip comments, blank lines, collapse whitespace
  const lines = qasm
    .split('\n')
    .map(l => l.replace(/\/\/.*/, '').trim())
    .filter(l => l.length > 0 && !l.startsWith('//'));

  let numQubits = 0;
  let numClbits = 0;

  // qubit register name → { start index, size }
  const qubitRegs: Record<string, { start: number; size: number }> = {};
  const clbitRegs: Record<string, { start: number; size: number }> = {};

  const rawOps: Array<{
    gate: string;
    params: number[];
    qubits: number[];
    clbits: number[];
  }> = [];

  for (const line of lines) {
    // QASM 2: qreg q[n];
    // QASM 3: qubit[n] q;  or  qubit q;
    const qreg2 = line.match(/^qreg\s+(\w+)\[(\d+)\]\s*;/);
    if (qreg2) {
      qubitRegs[qreg2[1]] = { start: numQubits, size: parseInt(qreg2[2]) };
      numQubits += parseInt(qreg2[2]);
      continue;
    }

    const qreg3 = line.match(/^qubit(?:\[(\d+)\])?\s+(\w+)\s*;/);
    if (qreg3) {
      const sz = qreg3[1] ? parseInt(qreg3[1]) : 1;
      qubitRegs[qreg3[2]] = { start: numQubits, size: sz };
      numQubits += sz;
      continue;
    }

    // QASM 2: creg c[n];
    // QASM 3: bit[n] c;
    const creg2 = line.match(/^creg\s+(\w+)\[(\d+)\]\s*;/);
    if (creg2) {
      clbitRegs[creg2[1]] = { start: numClbits, size: parseInt(creg2[2]) };
      numClbits += parseInt(creg2[2]);
      continue;
    }

    const creg3 = line.match(/^bit(?:\[(\d+)\])?\s+(\w+)\s*;/);
    if (creg3) {
      const sz = creg3[1] ? parseInt(creg3[1]) : 1;
      clbitRegs[creg3[2]] = { start: numClbits, size: sz };
      numClbits += sz;
      continue;
    }

    // Skip OPENQASM header, includes, gate/cal defs, barriers, delays
    if (
      line.startsWith('OPENQASM') ||
      line.startsWith('include') ||
      line.startsWith('gate ') ||
      line.startsWith('cal ') ||
      line.startsWith('defcal ') ||
      line.startsWith('barrier') ||
      line.startsWith('delay') ||
      line.startsWith('reset') ||
      line.startsWith('if ') ||
      line === '{'  || line === '}'
    ) continue;

    // Gate instruction
    const gateOp = _parseGateInstruction(line, qubitRegs, clbitRegs);
    if (gateOp) rawOps.push(gateOp);
  }

  // Assign time columns using a greedy per-qubit scheduler
  const qubitTime = new Array(numQubits).fill(0);
  const operations: Operation[] = [];

  for (const raw of rawOps) {
    const gate = QASM_GATE_MAP[raw.gate.toLowerCase()];
    if (!gate) continue;

    const time = raw.qubits.length > 0
      ? Math.max(...raw.qubits.map(q => qubitTime[q] ?? 0))
      : 0;

    const targets: OperationTargets = { qubits: raw.qubits };
    if (raw.clbits.length > 0) targets.clbits = raw.clbits;

    operations.push({
      id: nextId(),
      type: gate,
      targets,
      time,
    });

    // Advance time for all involved qubits
    for (const q of raw.qubits) {
      qubitTime[q] = time + 1;
    }
  }

  return {
    schemaVersion: 1,
    qubits: Math.max(numQubits, 0),
    clbits: Math.max(numClbits, 0),
    operations,
  };
}

/** Resolves a qubit/clbit wire reference like "q[0]" or "q" to an absolute index. */
function resolveWire(
  ref: string,
  regs: Record<string, { start: number; size: number }>
): number[] {
  const indexed = ref.match(/^(\w+)\[(\d+)\]$/);
  if (indexed) {
    const reg = regs[indexed[1]];
    if (!reg) return [];
    return [reg.start + parseInt(indexed[2])];
  }
  const whole = regs[ref.trim()];
  if (whole) {
    return Array.from({ length: whole.size }, (_, i) => whole.start + i);
  }
  return [];
}

function _parseGateInstruction(
  line: string,
  qubitRegs: Record<string, { start: number; size: number }>,
  clbitRegs: Record<string, { start: number; size: number }>
): { gate: string; params: number[]; qubits: number[]; clbits: number[] } | null {
  // Measure: "measure q[0] -> c[0];" or "q[0] -> c[0];" in QASM3 measure block
  const measureMatch = line.match(/^measure\s+(.+?)\s*->\s*(.+?)\s*;?$/);
  if (measureMatch) {
    const qRefs = measureMatch[1].split(',').map(s => s.trim());
    const cRefs = measureMatch[2].split(',').map(s => s.trim());
    const qubits = qRefs.flatMap(r => resolveWire(r, qubitRegs));
    const clbits = cRefs.flatMap(r => resolveWire(r, clbitRegs));
    if (qubits.length > 0) return { gate: 'measure', params: [], qubits, clbits };
    return null;
  }

  // Standard gate: "h q[0];"  "cx q[0], q[1];"  "rz(π/4) q[0];"
  // QASM3 also: "rz(1.5707963267948966) $0;"
  const gateMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\(([^)]*)\))?\s+(.+?)\s*;?$/);
  if (!gateMatch) return null;

  const gateName = gateMatch[1].toLowerCase();
  const paramsStr = gateMatch[2] || '';
  const wiresStr = gateMatch[3] || '';

  // Parse numeric params (ignore symbolic, pi, π)
  const params: number[] = paramsStr
    ? paramsStr
        .split(',')
        .map(s => {
          const v = s.trim().replace(/π|pi/gi, String(Math.PI));
          try { return parseFloat(eval(v)); } catch { return 0; }
        })
        .filter(n => !isNaN(n))
    : [];

  // Parse qubit wires — handle QASM3 physical qubits like $0, $1
  const wireTokens = wiresStr.split(',').map(s => s.trim());
  const qubits: number[] = [];
  const clbits: number[] = [];

  for (const tok of wireTokens) {
    // Physical qubit: $0
    const physMatch = tok.match(/^\$(\d+)$/);
    if (physMatch) {
      qubits.push(parseInt(physMatch[1]));
      continue;
    }
    // Named register reference
    const resolved = resolveWire(tok, qubitRegs);
    if (resolved.length > 0) {
      qubits.push(...resolved);
    }
  }

  if (!QASM_GATE_MAP[gateName]) return null;
  return { gate: gateName, params, qubits, clbits };
}
