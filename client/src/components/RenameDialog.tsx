import { useRef, useEffect, useState } from 'react';

interface RenameDialogProps {
  open: boolean;
  currentName: string;
  onConfirm: (newName: string) => Promise<void>;
  onCancel: () => void;
}

const MAX_NAME_LENGTH = 120;

export default function RenameDialog({
  open,
  currentName,
  onConfirm,
  onCancel,
}: RenameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setName(currentName);
      setError(null);
      setSubmitting(false);
      dialog.showModal();
      // Focus the input after the dialog opens
      requestAnimationFrame(() => inputRef.current?.select());
    } else {
      dialog.close();
    }
  }, [open, currentName]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    if (trimmed === currentName) {
      onCancel();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename experiment.');
      setSubmitting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby="rename-dialog-title">
      <form onSubmit={handleSubmit} className="dialog__content">
        <h2 id="rename-dialog-title" className="dialog__title">
          Rename Experiment
        </h2>

        <div className="form-field">
          <label htmlFor="rename-input" className="form-field__label">
            Experiment name
          </label>
          <input
            ref={inputRef}
            id="rename-input"
            type="text"
            className="form-field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            disabled={submitting}
            aria-describedby={error ? 'rename-error' : undefined}
          />
          {error && (
            <p id="rename-error" className="form-field__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Renaming...' : 'Rename'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
