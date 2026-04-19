import type { CircuitModel } from '../../circuit';

/**
 * ExportControls provides copy-to-clipboard and download-as-file actions
 * for the generated Qiskit Python code. Disabled when validation errors exist
 * or the circuit has no gates.
 */

interface ExportControlsProps {
  circuit: CircuitModel;
}

export default function ExportControls({ circuit }: ExportControlsProps) {
  const hasGates = circuit.operations.length > 0;
  // Validation integration will be added in a later step
  const hasErrors = false;
  const isDisabled = hasErrors || !hasGates;

  return (
    <div className="export-controls" aria-label="Export controls">
      <button
        type="button"
        className="btn btn--ghost export-controls__btn"
        disabled={isDisabled}
        title={isDisabled ? 'Add gates to enable export' : 'Copy code to clipboard'}
      >
        Copy code
      </button>
      <button
        type="button"
        className="btn btn--ghost export-controls__btn"
        disabled={isDisabled}
        title={isDisabled ? 'Add gates to enable export' : 'Download as .py file'}
      >
        Download .py
      </button>
    </div>
  );
}
