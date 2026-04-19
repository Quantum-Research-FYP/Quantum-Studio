import { useRef, useEffect, useState } from 'react';

interface DeleteConfirmDialogProps {
  open: boolean;
  experimentName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export default function DeleteConfirmDialog({
  open,
  experimentName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setDeleting(false);
      setError(null);
      dialog.showModal();
      // Focus the cancel button (safe default) after dialog opens
      requestAnimationFrame(() => cancelRef.current?.focus());
    } else {
      dialog.close();
    }
  }, [open]);

  // Handle native dialog cancel (Escape key)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);

    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete experiment.');
      setDeleting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby="delete-dialog-title">
      <div className="dialog__content">
        <h2 id="delete-dialog-title" className="dialog__title">
          Delete Experiment
        </h2>

        <p className="dialog__message">
          Are you sure you want to delete <strong>{experimentName}</strong>? This action cannot be
          undone.
        </p>

        {error && (
          <p className="form-field__error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
