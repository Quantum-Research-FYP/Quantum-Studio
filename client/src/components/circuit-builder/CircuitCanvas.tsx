import { useState } from 'react';
import type { CircuitModel, GateType, Operation, OperationTargets } from '../../circuit';
import { GATE_QUBIT_COUNT, GATE_REQUIRES_CLBITS } from '../../circuit';

/**
 * CircuitCanvas displays the quantum circuit as a grid/timeline.
 * Qubits and classical bits are shown as horizontal wires, with gates
 * placed at integer time-step columns.
 *
 * Placement flows:
 * - Single-qubit gates (H, X, Y, Z, S, T): click a qubit cell to place.
 * - CX: click the control qubit, then click the target qubit at the same time column.
 * - MEASURE: click a qubit cell; maps to the clbit at the same index (or first available).
 */

interface CircuitCanvasProps {
  circuit: CircuitModel;
  selectedGate: GateType | null;
  errorOperationIds: Set<string>;
  onPlaceGate: (type: GateType, targets: OperationTargets, time: number) => void;
  onDeleteGate: (operationId: string) => void;
}

/** Pending CX placement: the user has clicked the control qubit. */
interface PendingCx {
  controlQubit: number;
  time: number;
}

/** Minimum number of time columns to display. */
const MIN_COLUMNS = 8;

/** Build a lookup: (wireIndex, time) → operation for quick cell rendering. */
function buildCellMap(operations: Operation[]): Map<string, Operation> {
  const map = new Map<string, Operation>();
  for (const op of operations) {
    for (const q of op.targets.qubits) {
      map.set(`q${q}:${op.time}`, op);
    }
    if (op.targets.clbits) {
      for (const c of op.targets.clbits) {
        map.set(`c${c}:${op.time}`, op);
      }
    }
  }
  return map;
}

/** Compute the number of time columns to render. */
function getColumnCount(operations: Operation[]): number {
  if (operations.length === 0) return MIN_COLUMNS;
  const maxTime = Math.max(...operations.map((op) => op.time));
  return Math.max(MIN_COLUMNS, maxTime + 2);
}

/** Get a display label for an operation on a specific wire. */
function getGateLabel(op: Operation, wirePrefix: string, wireIndex: number): string {
  if (op.type === 'CX') {
    if (wirePrefix !== 'q') return '';
    return op.targets.qubits[0] === wireIndex ? '●' : 'X';
  }
  if (op.type === 'MEASURE') {
    return wirePrefix === 'q' ? 'M' : '◄';
  }
  return op.type;
}

export default function CircuitCanvas({
  circuit,
  selectedGate,
  errorOperationIds,
  onPlaceGate,
  onDeleteGate,
}: CircuitCanvasProps) {
  const { qubits, clbits, operations } = circuit;
  const [pendingCx, setPendingCx] = useState<PendingCx | null>(null);

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

  const handleCellClick = (wirePrefix: string, wireIndex: number, time: number) => {
    // Only qubit wires accept gate placement
    if (wirePrefix !== 'q') return;

    // Handle second click of CX placement
    if (pendingCx) {
      if (time === pendingCx.time && wireIndex !== pendingCx.controlQubit) {
        onPlaceGate('CX', { qubits: [pendingCx.controlQubit, wireIndex] }, time);
      }
      setPendingCx(null);
      return;
    }

    if (!selectedGate) return;

    // Check if cell is already occupied
    const existing = cellMap.get(`q${wireIndex}:${time}`);
    if (existing) return;

    // CX: start two-click flow — first click picks control qubit
    if (selectedGate === 'CX') {
      setPendingCx({ controlQubit: wireIndex, time });
      return;
    }

    // MEASURE: map qubit to clbit at same index (or clamped to available range)
    if (selectedGate === 'MEASURE') {
      if (clbits === 0) return; // Need at least one classical bit
      const clbitIndex = Math.min(wireIndex, clbits - 1);
      onPlaceGate('MEASURE', { qubits: [wireIndex], clbits: [clbitIndex] }, time);
      return;
    }

    // Single-qubit gates
    if (GATE_QUBIT_COUNT[selectedGate] === 1 && !GATE_REQUIRES_CLBITS[selectedGate]) {
      onPlaceGate(selectedGate, { qubits: [wireIndex] }, time);
    }
  };

  const handleGateClick = (e: React.MouseEvent, op: Operation) => {
    e.stopPropagation();
    // Cancel pending CX if clicking a gate
    if (pendingCx) {
      setPendingCx(null);
      return;
    }
    onDeleteGate(op.id);
  };

  /** Determine if a qubit cell is a valid placement target. */
  const isPlaceable = (wirePrefix: string, wireIndex: number, time: number): boolean => {
    if (wirePrefix !== 'q') return false;
    if (cellMap.has(`q${wireIndex}:${time}`)) return false;

    // Second click of CX — must be same time, different qubit
    if (pendingCx) {
      return time === pendingCx.time && wireIndex !== pendingCx.controlQubit;
    }

    if (!selectedGate) return false;

    if (selectedGate === 'MEASURE') return clbits > 0;
    if (selectedGate === 'CX') return true;
    return GATE_QUBIT_COUNT[selectedGate] === 1 && !GATE_REQUIRES_CLBITS[selectedGate];
  };

  const renderCell = (wirePrefix: string, wireIndex: number, time: number) => {
    const key = `${wirePrefix}${wireIndex}:${time}`;
    const op = cellMap.get(key);

    if (op) {
      const label = getGateLabel(op, wirePrefix, wireIndex);
      const hasError = errorOperationIds.has(op.id);
      const gateClass = `circuit-canvas__gate${hasError ? ' circuit-canvas__gate--error' : ''}`;
      const errorSuffix = hasError ? ' (has validation error)' : '';
      return (
        <td key={time} className="circuit-canvas__cell circuit-canvas__cell--gate">
          <button
            type="button"
            className={gateClass}
            onClick={(e) => handleGateClick(e, op)}
            title={`${op.type} gate — click to delete${errorSuffix}`}
            aria-label={`${op.type} gate at ${wirePrefix === 'q' ? 'qubit' : 'classical bit'} ${wireIndex}, time ${time}. Click to delete.${errorSuffix}`}
            aria-invalid={hasError || undefined}
          >
            {label}
            {hasError && (
              <span className="circuit-canvas__error-badge" aria-hidden="true">
                !
              </span>
            )}
          </button>
        </td>
      );
    }

    const canPlace = isPlaceable(wirePrefix, wireIndex, time);
    const isPendingTarget = pendingCx && time === pendingCx.time && wirePrefix === 'q' && wireIndex !== pendingCx.controlQubit;
    const isPendingControl = pendingCx && time === pendingCx.time && wirePrefix === 'q' && wireIndex === pendingCx.controlQubit;

    let placementLabel: string | undefined;
    if (isPendingTarget) {
      placementLabel = `Place CX target at qubit ${wireIndex}, time ${time}`;
    } else if (canPlace && selectedGate) {
      placementLabel = `Place ${selectedGate} at qubit ${wireIndex}, time ${time}`;
    }

    const cellClass = [
      'circuit-canvas__cell',
      canPlace ? 'circuit-canvas__cell--placeable' : '',
      isPendingControl ? 'circuit-canvas__cell--pending' : '',
    ]
      .filter(Boolean)
      .join(' ');

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
        {isPendingControl && (
          <span className="circuit-canvas__pending-marker" aria-hidden="true">
            ●
          </span>
        )}
      </td>
    );
  };

  return (
    <section className="circuit-canvas" aria-label="Circuit timeline">
      {pendingCx && (
        <div className="circuit-canvas__hint" role="status" aria-live="polite">
          Click a target qubit at time {pendingCx.time} for CX gate (or click elsewhere to cancel)
        </div>
      )}
      <div className="circuit-canvas__scroll">
        <table className="circuit-canvas__grid" role="grid">
          <thead>
            <tr>
              <th className="circuit-canvas__label-col" />
              {timeColumns.map((t) => (
                <th key={t} className="circuit-canvas__time-header">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: qubits }, (_, q) => (
              <tr key={`q${q}`} className="circuit-canvas__row circuit-canvas__row--qubit">
                <th className="circuit-canvas__wire-label" scope="row">
                  q{q}
                </th>
                {timeColumns.map((t) => renderCell('q', q, t))}
              </tr>
            ))}
            {Array.from({ length: clbits }, (_, c) => (
              <tr key={`c${c}`} className="circuit-canvas__row circuit-canvas__row--clbit">
                <th className="circuit-canvas__wire-label" scope="row">
                  c{c}
                </th>
                {timeColumns.map((t) => renderCell('c', c, t))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
