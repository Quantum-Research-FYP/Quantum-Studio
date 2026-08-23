/**
 * WireList displays the current qubit and classical bit counts
 * with controls to add or remove wires.
 */

interface WireListProps {
  qubits: number;
  clbits: number;
  onAddQubit: () => void;
  onRemoveQubit: () => void;
  onAddClbit: () => void;
  onRemoveClbit: () => void;
}

export default function WireList({
  qubits,
  clbits,
  onAddQubit,
  onRemoveQubit,
  onAddClbit,
  onRemoveClbit,
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

      <div className="wire-list__group">
        <span className="wire-list__label">Classical</span>
        <div className="wire-list__controls">
          <button
            type="button"
            className="wire-list__btn"
            aria-label="Remove classical bit"
            disabled={clbits === 0}
            onClick={onRemoveClbit}
          >
            &minus;
          </button>
          <span className="wire-list__count" aria-live="polite">
            {clbits}
          </span>
          <button
            type="button"
            className="wire-list__btn"
            aria-label="Add classical bit"
            onClick={onAddClbit}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
