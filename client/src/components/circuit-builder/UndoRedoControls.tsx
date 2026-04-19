/**
 * UndoRedoControls provides undo and redo buttons for circuit editing history.
 */
export default function UndoRedoControls() {
  const canUndo = false;
  const canRedo = false;

  return (
    <div className="undo-redo" aria-label="Undo and redo controls">
      <button
        type="button"
        className="btn btn--ghost undo-redo__btn"
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo"
      >
        &#8630; Undo
      </button>
      <button
        type="button"
        className="btn btn--ghost undo-redo__btn"
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo"
      >
        Redo &#8631;
      </button>
    </div>
  );
}
