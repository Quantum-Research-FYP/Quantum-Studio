/**
 * WireList displays the current qubit and classical bit counts
 * with controls to add or remove wires.
 */
export default function WireList() {
  const qubits = 0;
  const clbits = 0;

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
          >
            &minus;
          </button>
          <span className="wire-list__count" aria-live="polite">
            {qubits}
          </span>
          <button type="button" className="wire-list__btn" aria-label="Add qubit">
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
          >
            &minus;
          </button>
          <span className="wire-list__count" aria-live="polite">
            {clbits}
          </span>
          <button type="button" className="wire-list__btn" aria-label="Add classical bit">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
