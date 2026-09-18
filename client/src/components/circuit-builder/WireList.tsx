/**
 * WireList displays the current qubit count with controls to add or remove wires.
 */

interface WireListProps {
  qubits: number;
  onAddQubit: () => void;
  onRemoveQubit: () => void;
}

export default function WireList({
  qubits,
  onAddQubit,
  onRemoveQubit,
}: WireListProps) {
  return (
    <div className="wire-list" aria-label="Wire controls">
      <div className="wire-list__group">
        <span className="wire-list__label">Qubits</span>
        <div className="wire-list__controls">
          <button
            type="button"
            className="wire-list__btn"
            aria-label="Remove qubit"
            disabled={qubits === 0}
            onClick={onRemoveQubit}
          >
            &minus;
          </button>
          <span className="wire-list__count" aria-live="polite">
            {qubits}
          </span>
          <button
            type="button"
            className="wire-list__btn"
            aria-label="Add qubit"
            onClick={onAddQubit}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
