/**
 * ExportControls provides copy-to-clipboard and download-as-file actions
 * for the generated Qiskit Python code. Disabled when validation errors exist.
 */
export default function ExportControls() {
  const hasErrors = false;
  const hasGates = false;
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
