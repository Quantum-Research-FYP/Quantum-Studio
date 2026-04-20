import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useExecution } from '../hooks/useExecution';
import type { ExecutionJobResponse } from '../api/execution';
import ProbabilityBarChart from '../components/results/ProbabilityBarChart';
import ResultsTable from '../components/results/ResultsTable';
import ExportButtons from '../components/results/ExportButtons';

const DEFAULT_MAX_DISPLAY = 20;

export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const {
    job,
    viewState,
    outcomes,
    error,
    polling,
    cancelling,
    cancelError,
    loadJob,
    cancel,
  } = useExecution();

  const [showChart, setShowChart] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (jobId) {
      loadJob(jobId);
    }
  }, [jobId, loadJob]);

  useEffect(() => {
    setShowAll(false);
  }, [jobId]);

  const maxDisplay = showAll ? undefined : DEFAULT_MAX_DISPLAY;
  const canShowAll = outcomes.length > DEFAULT_MAX_DISPLAY;

  // ── no-job state ──────────────────────────────────────────────────────
  if (!jobId || viewState === 'no-job') {
    return (
      <div className="page">
        <h1 className="page__title">Results</h1>
        <p className="page__subtitle">
          No job selected.{' '}
          <Link to="/run" className="results-link">
            Run a circuit
          </Link>{' '}
          to see results here.
        </p>
      </div>
    );
  }

  // ── loading state ─────────────────────────────────────────────────────
  if (viewState === 'loading') {
    return (
      <div className="page">
        <h1 className="page__title">Results</h1>
        <p className="page__subtitle">Loading job...</p>
      </div>
    );
  }

  // ── error (fetch failure) ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="results-page">
        <h1 className="results-page__title">Results</h1>
        <div className="alert alert--error" role="alert">
          {error}
        </div>
        <Link to="/run" className="btn btn--primary">
          Run a new circuit
        </Link>
      </div>
    );
  }

  if (!job) return null;

  const isIbm = job.provider === 'ibm_quantum';
  const isCancellable = ['submitted', 'queued', 'running'].includes(job.status);

  return (
    <div className="results-page">
      <h1 className="results-page__title">
        {isIbm ? 'Hardware Execution Results' : 'Simulation Results'}
      </h1>

      <JobStatusPanel job={job} polling={polling} />

      {/* Provider metadata for traceability */}
      {isIbm && <ProviderMetadataPanel job={job} />}

      {/* Cancel action */}
      {isCancellable && (
        <CancelJobPanel
          cancelling={cancelling}
          cancelError={cancelError}
          onCancel={cancel}
        />
      )}

      {/* ── pending state ──────────────────────────────────────────── */}
      {viewState === 'pending' && (
        <PendingBanner job={job} polling={polling} />
      )}

      {/* ── cancelled state ────────────────────────────────────────── */}
      {viewState === 'cancelled' && <CancelledBanner job={job} />}

      {/* ── failed state ───────────────────────────────────────────── */}
      {viewState === 'failed' && job.error && (
        <ErrorBanner error={job.error} isIbm={isIbm} />
      )}

      {/* ── empty-results state ────────────────────────────────────── */}
      {viewState === 'empty-results' && (
        <div className="results-empty" role="status">
          <p className="results-empty__message">
            No measurement outcomes available. The job completed but produced no results.
          </p>
        </div>
      )}

      {/* ── completed state: chart + table ─────────────────────────── */}
      {viewState === 'completed' && (
        <CompletedResults
          jobId={jobId}
          outcomes={outcomes}
          showChart={showChart}
          showTable={showTable}
          showAll={showAll}
          maxDisplay={maxDisplay}
          canShowAll={canShowAll}
          onToggleChart={() => setShowChart((v) => !v)}
          onToggleTable={() => setShowTable((v) => !v)}
          onToggleShowAll={() => setShowAll((v) => !v)}
        />
      )}

      <div className="results-page__actions">
        <Link to="/run" className="btn btn--primary">
          Run another circuit
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function JobStatusPanel({
  job,
  polling,
}: {
  job: ExecutionJobResponse;
  polling: boolean;
}) {
  return (
    <div className="job-status-panel" role="status" aria-live="polite">
      <div className="job-status-panel__row">
        <span className="job-status-panel__label">Job ID</span>
        <code className="job-status-panel__value">{job.jobId}</code>
      </div>
      <div className="job-status-panel__row">
        <span className="job-status-panel__label">Status</span>
        <StatusBadge status={job.status} polling={polling} />
      </div>
      <div className="job-status-panel__row">
        <span className="job-status-panel__label">Provider</span>
        <span className="job-status-panel__value">
          {job.provider === 'ibm_quantum' ? 'IBM Quantum' : 'Simulator'}
        </span>
      </div>
      <div className="job-status-panel__row">
        <span className="job-status-panel__label">Shots</span>
        <span className="job-status-panel__value">{job.shots.toLocaleString()}</span>
      </div>
      <div className="job-status-panel__row">
        <span className="job-status-panel__label">Backend</span>
        <span className="job-status-panel__value">{job.backend}</span>
      </div>
      <div className="job-status-panel__row">
        <span className="job-status-panel__label">Submitted</span>
        <span className="job-status-panel__value">{new Date(job.createdAt).toLocaleString()}</span>
      </div>
      {job.startedAt && (
        <div className="job-status-panel__row">
          <span className="job-status-panel__label">Started</span>
          <span className="job-status-panel__value">
            {new Date(job.startedAt).toLocaleString()}
          </span>
        </div>
      )}
      {job.completedAt && (
        <div className="job-status-panel__row">
          <span className="job-status-panel__label">Completed</span>
          <span className="job-status-panel__value">
            {new Date(job.completedAt).toLocaleString()}
          </span>
        </div>
      )}
      {job.cancelledAt && (
        <div className="job-status-panel__row">
          <span className="job-status-panel__label">Cancelled</span>
          <span className="job-status-panel__value">
            {new Date(job.cancelledAt).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

function ProviderMetadataPanel({ job }: { job: ExecutionJobResponse }) {
  if (!job.providerJobId) return null;

  return (
    <div className="provider-metadata" aria-label="Provider details">
      <h3 className="provider-metadata__heading">Provider Details</h3>
      <div className="provider-metadata__row">
        <span className="provider-metadata__label">Provider Job ID</span>
        <code className="provider-metadata__value">{job.providerJobId}</code>
      </div>
    </div>
  );
}

function StatusBadge({ status, polling }: { status: string; polling: boolean }) {
  const config: Record<string, { label: string; className: string }> = {
    submitted: { label: 'Submitted', className: 'status-badge--submitted' },
    queued: { label: 'Queued', className: 'status-badge--queued' },
    running: { label: 'Running', className: 'status-badge--running' },
    completed: { label: 'Completed', className: 'status-badge--completed' },
    failed: { label: 'Failed', className: 'status-badge--failed' },
    cancelled: { label: 'Cancelled', className: 'status-badge--cancelled' },
  };

  const { label, className } = config[status] ?? {
    label: status,
    className: '',
  };

  const isPending = ['submitted', 'queued', 'running'].includes(status);

  return (
    <span
      className={`status-badge ${className}`}
      role="status"
      aria-label={`Job status: ${label}`}
    >
      {label}
      {polling && isPending && (
        <span className="status-badge__polling" aria-label="Checking for updates">
          {' '}...
        </span>
      )}
    </span>
  );
}

function CancelJobPanel({
  cancelling,
  cancelError,
  onCancel,
}: {
  cancelling: boolean;
  cancelError: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="cancel-panel">
      <button
        type="button"
        className="btn btn--danger btn--sm"
        onClick={onCancel}
        disabled={cancelling}
        aria-busy={cancelling}
      >
        {cancelling ? 'Cancelling...' : 'Cancel Job'}
      </button>
      {cancelError && (
        <p className="cancel-panel__error" role="alert">
          {cancelError}
        </p>
      )}
    </div>
  );
}

function PendingBanner({
  job,
  polling,
}: {
  job: ExecutionJobResponse;
  polling: boolean;
}) {
  const isIbm = job.provider === 'ibm_quantum';
  const statusLabel =
    job.status === 'submitted'
      ? 'submitted to IBM Quantum'
      : job.status === 'queued'
        ? 'queued on the hardware backend'
        : 'running on hardware';

  return (
    <div className="results-pending" role="status" aria-live="polite">
      <p className="results-pending__message">
        {isIbm
          ? `Job ${statusLabel}. Hardware queues may take longer than simulation.`
          : 'Results pending — waiting for the simulation to complete...'}
      </p>
      {polling && (
        <p className="results-pending__polling">
          Checking for updates automatically.
        </p>
      )}
    </div>
  );
}

function CancelledBanner({ job }: { job: ExecutionJobResponse }) {
  return (
    <div className="alert alert--warning" role="status">
      <p>
        <strong>Job was cancelled.</strong>
        {job.cancelledAt && (
          <> Cancelled at {new Date(job.cancelledAt).toLocaleString()}.</>
        )}
      </p>
      <p>
        <Link to="/run">Run a new circuit</Link> to try again.
      </p>
    </div>
  );
}

function ErrorBanner({
  error,
  isIbm,
}: {
  error: { errorCode: string; message: string };
  isIbm: boolean;
}) {
  const guidance: Record<string, string> = {
    VALIDATION_MAX_QUBITS: 'Try reducing the number of qubits in your circuit.',
    VALIDATION_MAX_SHOTS: 'Try reducing the number of shots.',
    VALIDATION_MAX_DEPTH: 'Try simplifying your circuit to reduce gate depth.',
    VALIDATION_SYNTAX: 'Check your OpenQASM syntax for errors.',
    EXECUTION_TIMEOUT: 'Try a simpler circuit or fewer shots.',
    EXECUTION_RUNTIME_ERROR: 'Check your circuit for errors and try again.',
    IBM_EXECUTION_ERROR: 'The hardware execution encountered an error. Try running on the simulator instead.',
    PROVIDER_UNAVAILABLE: 'IBM Quantum is temporarily unavailable. Try again later or use the simulator.',
    NETWORK_ERROR: 'Could not reach IBM Quantum. Check your connection or use the simulator.',
  };

  const hint = guidance[error.errorCode];

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner__header">
        {isIbm ? 'Hardware Execution Failed' : 'Simulation Failed'}
      </div>
      <p className="error-banner__message">{error.message}</p>
      {hint && <p className="error-banner__hint">{hint}</p>}
      {isIbm && !hint && (
        <p className="error-banner__hint">
          Consider running your circuit on the simulator as a fallback.
        </p>
      )}
      <details className="error-banner__details">
        <summary className="error-banner__details-toggle">Error details</summary>
        <p className="error-banner__code">Error code: {error.errorCode}</p>
      </details>
    </div>
  );
}

function CompletedResults({
  jobId,
  outcomes,
  showChart,
  showTable,
  showAll,
  maxDisplay,
  canShowAll,
  onToggleChart,
  onToggleTable,
  onToggleShowAll,
}: {
  jobId: string;
  outcomes: import('../api/simulations').Outcome[];
  showChart: boolean;
  showTable: boolean;
  showAll: boolean;
  maxDisplay: number | undefined;
  canShowAll: boolean;
  onToggleChart: () => void;
  onToggleTable: () => void;
  onToggleShowAll: () => void;
}) {
  return (
    <>
      <div className="results-toggles">
        <button
          type="button"
          className={`btn btn--ghost results-toggle ${showChart ? 'results-toggle--active' : ''}`}
          onClick={onToggleChart}
          aria-pressed={showChart}
        >
          {showChart ? 'Hide chart' : 'Show chart'}
        </button>
        <button
          type="button"
          className={`btn btn--ghost results-toggle ${showTable ? 'results-toggle--active' : ''}`}
          onClick={onToggleTable}
          aria-pressed={showTable}
        >
          {showTable ? 'Hide table' : 'Show table'}
        </button>
        {canShowAll && (
          <button
            type="button"
            className="btn btn--ghost results-toggle"
            onClick={onToggleShowAll}
            aria-pressed={showAll}
          >
            {showAll ? `Show top ${DEFAULT_MAX_DISPLAY}` : 'Show all outcomes'}
          </button>
        )}
      </div>

      {showChart && (
        <div className="results-chart-container">
          <h2 className="results-section__title">Probability Distribution</h2>
          <ProbabilityBarChart outcomes={outcomes} maxDisplay={maxDisplay} />
        </div>
      )}

      {showTable && (
        <div className="results-table-container">
          <h2 className="results-section__title">Measurement Results</h2>
          <ResultsTable outcomes={outcomes} maxDisplay={maxDisplay} />
        </div>
      )}

      <ExportButtons jobId={jobId} chartVisible={showChart} />
    </>
  );
}
