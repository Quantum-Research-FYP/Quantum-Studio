/**
 * UndoRedoControls provides undo and redo buttons for circuit editing history.
 */

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export default function UndoRedoControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: UndoRedoControlsProps) {
  return (
    <div className="undo-redo" aria-label="Undo and redo controls">
      <button
        type="button"
        className="btn btn--ghost undo-redo__btn"
        disabled={!canUndo}
        onClick={onUndo}
        aria-label="Undo"
        title="Undo"
      >
        &#8630; Undo
      </button>
      <button
        type="button"
        className="btn btn--ghost undo-redo__btn"
        disabled={!canRedo}
        onClick={onRedo}
        aria-label="Redo"
        title="Redo"
      >
        Redo &#8631;
      </button>
    </div>
  );
}
