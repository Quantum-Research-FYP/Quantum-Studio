import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listExperiments,
  renameExperiment,
  deleteExperiment,
  type ExperimentListItem,
  type ExperimentListOptions,
} from '../api/experiments';
import RenameDialog from '../components/RenameDialog';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, DATE_FORMAT);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExperimentsPage() {
  const navigate = useNavigate();

  // List state
  const [items, setItems] = useState<ExperimentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sortBy] = useState<ExperimentListOptions['sortBy']>('updated_at');
  const [sortOrder] = useState<ExperimentListOptions['sortOrder']>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [renameTarget, setRenameTarget] = useState<ExperimentListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExperimentListItem | null>(null);

  // Ref for returning focus after dialog closes
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Fetch experiments list
  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listExperiments({ page, pageSize, sortBy, sortOrder });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load experiments.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Actions
  const handleOpen = useCallback(
    (experiment: ExperimentListItem) => {
      navigate(`/builder?experimentId=${encodeURIComponent(experiment.id)}`);
    },
    [navigate],
  );

  const handleRenameClick = useCallback(
    (experiment: ExperimentListItem, triggerEl: HTMLButtonElement) => {
      actionTriggerRef.current = triggerEl;
      setRenameTarget(experiment);
    },
    [],
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renameTarget) return;
      await renameExperiment(renameTarget.id, newName, renameTarget.rowVersion);
      setRenameTarget(null);
      actionTriggerRef.current?.focus();
      await fetchList();
    },
    [renameTarget, fetchList],
  );

  const handleRenameCancel = useCallback(() => {
    setRenameTarget(null);
    requestAnimationFrame(() => actionTriggerRef.current?.focus());
  }, []);

  const handleDeleteClick = useCallback(
    (experiment: ExperimentListItem, triggerEl: HTMLButtonElement) => {
      actionTriggerRef.current = triggerEl;
      setDeleteTarget(experiment);
    },
    [],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteExperiment(deleteTarget.id);
    setDeleteTarget(null);
    actionTriggerRef.current?.focus();
    // If we deleted the last item on this page, go back one page
    if (items.length === 1 && page > 1) {
      setPage(page - 1);
    } else {
      await fetchList();
    }
  }, [deleteTarget, fetchList, items.length, page]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
    requestAnimationFrame(() => actionTriggerRef.current?.focus());
  }, []);

  // Empty state
  if (!loading && !error && total === 0) {
    return (
      <div className="page">
        <h1 className="page__title">My Experiments</h1>
        <p className="page__subtitle">You don&apos;t have any saved experiments yet.</p>

        <div className="cta-group">
          <Link to="/create" className="cta-card">
            <span className="cta-card__icon" aria-hidden="true">
              +
            </span>
            <span className="cta-card__label">Create a new circuit</span>
          </Link>

          <Link to="/templates" className="cta-card">
            <span className="cta-card__icon" aria-hidden="true">
              &#9638;
            </span>
            <span className="cta-card__label">View templates</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="experiments-page">
      <div className="experiments-page__header">
        <h1 className="page__title">My Experiments</h1>
        <Link to="/builder" className="btn btn--primary">
          New Experiment
        </Link>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="experiments-page__loading">Loading experiments...</p>
      ) : (
        <>
          <table className="experiments-table" aria-label="My experiments">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Updated</th>
                <th scope="col">Status</th>
                <th scope="col">Last Run</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((experiment) => (
                <tr key={experiment.id}>
                  <td className="experiments-table__name">
                    <button
                      className="experiments-table__name-btn"
                      onClick={() => handleOpen(experiment)}
                      aria-label={`Open ${experiment.name}`}
                    >
                      {experiment.name}
                    </button>
                  </td>
                  <td className="experiments-table__date">{formatDate(experiment.updatedAt)}</td>
                  <td>
                    {experiment.lastRunStatus ? (
                      <span
                        className={`status-badge status-badge--${experiment.lastRunStatus}`}
                      >
                        {experiment.lastRunStatus}
                      </span>
                    ) : (
                      <span className="experiments-table__muted">--</span>
                    )}
                  </td>
                  <td className="experiments-table__date">
                    {experiment.lastRunAt ? formatDate(experiment.lastRunAt) : '--'}
                  </td>
                  <td className="experiments-table__actions">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleOpen(experiment)}
                      aria-label={`Open ${experiment.name}`}
                    >
                      Open
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={(e) =>
                        handleRenameClick(experiment, e.currentTarget)
                      }
                      aria-label={`Rename ${experiment.name}`}
                    >
                      Rename
                    </button>
                    <button
                      className="btn btn--ghost btn--sm btn--danger-text"
                      onClick={(e) =>
                        handleDeleteClick(experiment, e.currentTarget)
                      }
                      aria-label={`Delete ${experiment.name}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="pagination" aria-label="Experiments pagination">
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="pagination__info">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {/* Dialogs */}
      <RenameDialog
        open={renameTarget !== null}
        currentName={renameTarget?.name ?? ''}
        onConfirm={handleRenameConfirm}
        onCancel={handleRenameCancel}
      />
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        experimentName={deleteTarget?.name ?? ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
