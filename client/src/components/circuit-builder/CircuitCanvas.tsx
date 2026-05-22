import { useState } from 'react';
import type { CircuitModel, GateType, Operation, OperationTargets } from '../../circuit';
import {
  GATE_PARAM_SPECS,
  GATE_QUBIT_COUNT,
  GATE_REQUIRES_CLBITS,
  PARAMETERIZED_GATES,
} from '../../circuit';
import AngleInputDialog from './AngleInputDialog';

/**
 * CircuitCanvas renders the quantum circuit as a grid/timeline.
 *
 * Placement state machine:
 *   idle → (click qubit, 1-qubit non-param) → place immediately
 *   idle → (click qubit, 1-qubit param)     → awaiting_angle
 *   idle → (click qubit, n-qubit gate)      → collecting (accumulate qubits)
 *   collecting → (last qubit, non-param)    → place immediately
 *   collecting → (last qubit, param)        → awaiting_angle
 *   awaiting_angle → confirm                → place with params
 *   any → cancel / click outside time col  → idle
 */

interface CircuitCanvasProps {
  circuit: CircuitModel;
  selectedGate: GateType | null;
  errorOperationIds: Set<string>;
  onPlaceGate: (type: GateType, targets: OperationTargets, time: number, params?: Record<string, number>) => void;
  onDeleteGate: (operationId: string) => void;
}

// ── Placement state ──────────────────────────────────────────────────────────

type PlacementState =
  | { stage: 'idle' }
  | { stage: 'collecting'; gate: GateType; qubits: number[]; time: number }
  | { stage: 'awaiting_angle'; gate: GateType; qubits: number[]; time: number };

const IDLE: PlacementState = { stage: 'idle' };

/** Gates that need multi-click qubit selection. */
const MULTI_QUBIT_GATES = new Set<GateType>([
  'CX', 'CZ', 'CY', 'CH', 'SWAP',
  'CRX', 'CRY', 'CRZ', 'CP',
  'CCX', 'CSWAP',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

const MIN_COLUMNS = 8;

function buildCellMap(operations: Operation[]): Map<string, Operation> {
  const map = new Map<string, Operation>();
  for (const op of operations) {
    for (const q of op.targets.qubits) map.set(`q${q}:${op.time}`, op);
    if (op.targets.clbits) {
      for (const c of op.targets.clbits) map.set(`c${c}:${op.time}`, op);
    }
  }
  return map;
}

function getColumnCount(operations: Operation[]): number {
  if (operations.length === 0) return MIN_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.max(...operations.map((op) => op.time)) + 2);
}

/** Label to render on a gate cell for the given wire. */
function getGateLabel(op: Operation, wirePrefix: string, wireIndex: number): string {
  if (wirePrefix !== 'q') return op.type === 'MEASURE' ? '◄' : '';
  const q = op.targets.qubits;

  switch (op.type) {
    case 'CX':    return q[0] === wireIndex ? '●' : '⊕';
    case 'CZ':    return '●';
    case 'CY':    return q[0] === wireIndex ? '●' : 'Y';
    case 'CH':    return q[0] === wireIndex ? '●' : 'H';
    case 'SWAP':  return '×';
    case 'CRX':   return q[0] === wireIndex ? '●' : 'Rx';
    case 'CRY':   return q[0] === wireIndex ? '●' : 'Ry';
    case 'CRZ':   return q[0] === wireIndex ? '●' : 'Rz';
    case 'CP':    return q[0] === wireIndex ? '●' : 'P';
    case 'CCX':   return q[2] === wireIndex ? '⊕' : '●';
    case 'CSWAP': return q[0] === wireIndex ? '●' : '×';
    case 'MEASURE': return 'M';
    case 'RX':  return 'Rx';
    case 'RY':  return 'Ry';
    case 'RZ':  return 'Rz';
    case 'P':   return 'P';
    case 'U':   return 'U';
    case 'ID':  return 'I';
    default:    return op.type;
  }
}

/** Text for the placement hint bar. */
function hintText(ps: PlacementState): string {
  if (ps.stage !== 'collecting') return '';
  const total = GATE_QUBIT_COUNT[ps.gate];
  const step = ps.qubits.length + 1;

  const stepNames: Partial<Record<GateType, string[]>> = {
    CX:   ['control', 'target'],
    CZ:   ['qubit 1', 'qubit 2'],
    CY:   ['control', 'target'],
    CH:   ['control', 'target'],
    SWAP: ['qubit 1', 'qubit 2'],
    CRX:  ['control', 'target'],
    CRY:  ['control', 'target'],
    CRZ:  ['control', 'target'],
    CP:   ['control', 'target'],
    CCX:  ['control 1', 'control 2', 'target'],
    CSWAP: ['control', 'swap qubit 1', 'swap qubit 2'],
  };
  const label = stepNames[ps.gate]?.[step - 1] ?? `qubit ${step}`;
  return `${ps.gate}: click ${label} at time ${ps.time} (${step}/${total}) — click elsewhere to cancel`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CircuitCanvas({
  circuit,
  selectedGate,
  errorOperationIds,
  onPlaceGate,
  onDeleteGate,
}: CircuitCanvasProps) {
  const { qubits, clbits, operations } = circuit;
  const [ps, setPs] = useState<PlacementState>(IDLE);

  if (qubits === 0 && clbits === 0) {
    return (
      <section className="circuit-canvas" aria-label="Circuit timeline">
        <div className="circuit-canvas__empty">
          <p>Add qubits and gates to start building your circuit.</p>
        </div>
      </section>
    );
  }

  const columnCount = getColumnCount(operations);
  const cellMap = buildCellMap(operations);
  const timeColumns = Array.from({ length: columnCount }, (_, i) => i);

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleCellClick = (wirePrefix: string, wireIndex: number, time: number) => {
    if (wirePrefix !== 'q') return;

    // Collecting multi-qubit selection
    if (ps.stage === 'collecting') {
      if (time !== ps.time || ps.qubits.includes(wireIndex)) {
        setPs(IDLE);
        return;
      }
      const nextQubits = [...ps.qubits, wireIndex];
      const required = GATE_QUBIT_COUNT[ps.gate];
      if (nextQubits.length < required) {
        setPs({ ...ps, qubits: nextQubits });
        return;
      }
      // All qubits collected
      if (PARAMETERIZED_GATES.has(ps.gate)) {
        setPs({ stage: 'awaiting_angle', gate: ps.gate, qubits: nextQubits, time: ps.time });
      } else {
        onPlaceGate(ps.gate, { qubits: nextQubits }, ps.time);
        setPs(IDLE);
      }
      return;
    }

    // Angle dialog is open — ignore canvas clicks
    if (ps.stage === 'awaiting_angle') return;

    // Idle — start a new placement
    if (!selectedGate) return;
    if (cellMap.has(`q${wireIndex}:${time}`)) return;

    if (MULTI_QUBIT_GATES.has(selectedGate)) {
      setPs({ stage: 'collecting', gate: selectedGate, qubits: [wireIndex], time });
      return;
    }

    if (selectedGate === 'MEASURE') {
      if (clbits === 0) return;
      const clbitIndex = Math.min(wireIndex, clbits - 1);
      onPlaceGate('MEASURE', { qubits: [wireIndex], clbits: [clbitIndex] }, time);
      return;
    }

    if (GATE_QUBIT_COUNT[selectedGate] === 1 && !GATE_REQUIRES_CLBITS[selectedGate]) {
      if (PARAMETERIZED_GATES.has(selectedGate)) {
        setPs({ stage: 'awaiting_angle', gate: selectedGate, qubits: [wireIndex], time });
      } else {
        onPlaceGate(selectedGate, { qubits: [wireIndex] }, time);
      }
    }
  };

  const handleGateClick = (e: React.MouseEvent, op: Operation) => {
    e.stopPropagation();
    if (ps.stage !== 'idle') {
      setPs(IDLE);
      return;
    }
    onDeleteGate(op.id);
  };

  const handleAngleConfirm = (values: Record<string, number>) => {
    if (ps.stage !== 'awaiting_angle') return;
    onPlaceGate(ps.gate, { qubits: ps.qubits }, ps.time, values);
    setPs(IDLE);
  };

  const handleAngleCancel = () => setPs(IDLE);

  // ── Placement highlighting ──────────────────────────────────────────────────

  const isPlaceable = (wirePrefix: string, wireIndex: number, time: number): boolean => {
    if (wirePrefix !== 'q') return false;
    if (cellMap.has(`q${wireIndex}:${time}`)) return false;

    if (ps.stage === 'collecting') {
      return time === ps.time && !ps.qubits.includes(wireIndex);
    }
    if (ps.stage === 'awaiting_angle') return false;
    if (!selectedGate) return false;
    if (selectedGate === 'MEASURE') return clbits > 0;
    if (MULTI_QUBIT_GATES.has(selectedGate)) return true;
    return GATE_QUBIT_COUNT[selectedGate] === 1 && !GATE_REQUIRES_CLBITS[selectedGate];
  };

  const isChosen = (wirePrefix: string, wireIndex: number, time: number): boolean =>
    wirePrefix === 'q' &&
    ps.stage === 'collecting' &&
    time === ps.time &&
    ps.qubits.includes(wireIndex);

  // ── Cell renderer ───────────────────────────────────────────────────────────

  const renderCell = (wirePrefix: string, wireIndex: number, time: number) => {
    const key = `${wirePrefix}${wireIndex}:${time}`;
    const op = cellMap.get(key);

    if (op) {
      const label = getGateLabel(op, wirePrefix, wireIndex);
      const hasError = errorOperationIds.has(op.id);
      const gateClass = `circuit-canvas__gate${hasError ? ' circuit-canvas__gate--error' : ''}`;
      return (
        <td key={time} className="circuit-canvas__cell circuit-canvas__cell--gate">
          <button
            type="button"
            className={gateClass}
            onClick={(e) => handleGateClick(e, op)}
            title={`${op.type} gate — click to delete${hasError ? ' (has validation error)' : ''}`}
            aria-label={`${op.type} gate at ${wirePrefix === 'q' ? 'qubit' : 'classical bit'} ${wireIndex}, time ${time}. Click to delete.`}
            aria-invalid={hasError || undefined}
          >
            {label}
            {hasError && (
              <span className="circuit-canvas__error-badge" aria-hidden="true">!</span>
            )}
          </button>
        </td>
      );
    }

    const canPlace = isPlaceable(wirePrefix, wireIndex, time);
    const chosen = isChosen(wirePrefix, wireIndex, time);

    let placementLabel: string | undefined;
    if (canPlace && ps.stage === 'collecting') {
      placementLabel = `Place ${ps.gate} qubit ${ps.qubits.length + 1}/${GATE_QUBIT_COUNT[ps.gate]} at qubit ${wireIndex}, time ${time}`;
    } else if (canPlace && selectedGate) {
      placementLabel = `Place ${selectedGate} at qubit ${wireIndex}, time ${time}`;
    }

    const cellClass = [
      'circuit-canvas__cell',
      canPlace ? 'circuit-canvas__cell--placeable' : '',
      chosen ? 'circuit-canvas__cell--pending' : '',
    ].filter(Boolean).join(' ');

    return (
      <td
        key={time}
        className={cellClass}
        onClick={() => handleCellClick(wirePrefix, wireIndex, time)}
        role={canPlace ? 'button' : undefined}
        tabIndex={canPlace ? 0 : undefined}
        aria-label={placementLabel}
        onKeyDown={
          canPlace
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCellClick(wirePrefix, wireIndex, time);
                }
              }
            : undefined
        }
      >
        <span className="circuit-canvas__wire" />
        {chosen && <span className="circuit-canvas__pending-marker" aria-hidden="true">●</span>}
      </td>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section className="circuit-canvas" aria-label="Circuit timeline">
      {ps.stage === 'collecting' && (
        <div className="circuit-canvas__hint" role="status" aria-live="polite">
          {hintText(ps)}
        </div>
      )}

      {ps.stage === 'awaiting_angle' && GATE_PARAM_SPECS[ps.gate] && (
        <AngleInputDialog
          gateLabel={ps.gate}
          paramSpecs={GATE_PARAM_SPECS[ps.gate]!}
          onConfirm={handleAngleConfirm}
          onCancel={handleAngleCancel}
        />
      )}

      <div className="circuit-canvas__scroll">
        <table className="circuit-canvas__grid" role="grid">
          <thead>
            <tr>
              <th className="circuit-canvas__label-col" />
              {timeColumns.map((t) => (
                <th key={t} className="circuit-canvas__time-header">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: qubits }, (_, q) => (
              <tr key={`q${q}`} className="circuit-canvas__row circuit-canvas__row--qubit">
                <th className="circuit-canvas__wire-label" scope="row">q{q}</th>
                {timeColumns.map((t) => renderCell('q', q, t))}
              </tr>
            ))}
            {Array.from({ length: clbits }, (_, c) => (
              <tr key={`c${c}`} className="circuit-canvas__row circuit-canvas__row--clbit">
                <th className="circuit-canvas__wire-label" scope="row">c{c}</th>
                {timeColumns.map((t) => renderCell('c', c, t))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
