import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useExecution } from '../hooks/useExecution';
import { useSimulation } from '../hooks/useSimulation';
import type { ExecutionJobResponse, ExecutionJobSummary } from '../api/execution';
import type { JobResponse, Outcome } from '../api/simulations';
import { listJobs } from '../api/execution';
import ProbabilityBarChart from '../components/results/ProbabilityBarChart';
import ResultsTable from '../components/results/ResultsTable';
import ExportButtons from '../components/results/ExportButtons';

const DEFAULT_MAX_DISPLAY = 20;

// ---------------------------------------------------------------------------
// Entry point — routes to the correct view based on ?source=
// ---------------------------------------------------------------------------

export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const source = searchParams.get('source');

  if (!jobId) {
    return <AllRunsHistoryView />;
  }

  if (source === 'sim') {
    return <SimulationResultsView jobId={jobId} />;
  }

  return <ExecutionResultsView jobId={jobId} />;
}

// ---------------------------------------------------------------------------
// AllRunsHistoryView — shown when /results is visited with no ?jobId
// ---------------------------------------------------------------------------

function AllRunsHistoryView() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ExecutionJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listJobs(50)
      .then((data) => setJobs(data.jobs))
      .catch(() => setError('Could not load run history.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="results-page">
      <div className="results-history-header">
        <div>
          <h1 className="results-page__title">Run History</h1>
          <p className="results-history-subtitle">All your previous circuit executions.</p>
        </div>
        <div className="results-history-header__actions">
          <Link to="/builder" className="btn btn--ghost btn--sm">
            Builder
          </Link>
          <Link to="/ide" className="btn btn--primary btn--sm">
            Run a circuit
          </Link>
        </div>
      </div>

      {loading && (
        <p className="results-history-loading">Loading run history…</p>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="results-history-empty">
          <p className="results-history-empty__msg">No runs yet.</p>
          <p className="results-history-empty__hint">
            Run a circuit from the{' '}
            <Link to="/builder" className="results-link">
              Builder
            </Link>{' '}
            or the{' '}
            <Link to="/ide" className="results-link">
              IDE
            </Link>
            .
          </p>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <table className="experiments-table run-history-table" aria-label="Run history">
          <thead>
            <tr>
              <th>Status</th>
              <th>Provider</th>
              <th>Backend</th>
              <th>Shots</th>
              <th>Submitted</th>
              <th>Completed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.jobId}
                className="run-history-table__row"
                onClick={() => navigate(`/results?jobId=${job.jobId}`)}
              >
                <td>
                  <span className="run-history-table__status">
                    <span
                      className={`run-history-item__dot run-history-item__dot--${job.status}`}
                    />
                    <span className="run-history-table__status-label">
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </span>
                </td>
                <td className="experiments-table__muted">
                  {job.provider === 'ibm_quantum' ? 'IBM Quantum' : 'Simulator'}
                </td>
                <td className="experiments-table__muted">{job.backend}</td>
                <td className="experiments-table__muted">{job.shots.toLocaleString()}</td>
                <td className="experiments-table__date">
                  {new Date(job.createdAt).toLocaleString()}
                </td>
                <td className="experiments-table__date">
                  {job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}
                </td>
                <td className="experiments-table__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/results?jobId=${job.jobId}`);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SimulationResultsView — for jobs created by the builder Run button
// Uses /api/v1/simulations endpoints
// ---------------------------------------------------------------------------

function SimulationResultsView({ jobId }: { jobId: string }) {
  const { job, viewState, outcomes, error, polling, loadJob } = useSimulation();
  const [showChart, setShowChart] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadJob(jobId);
  }, [jobId, loadJob]);

  useEffect(() => {
    setShowAll(false);
  }, [jobId]);

  const maxDisplay = showAll ? undefined : DEFAULT_MAX_DISPLAY;
  const canShowAll = outcomes.length > DEFAULT_MAX_DISPLAY;

  if (viewState === 'loading') {
    return (
      <div className="page">
        <h1 className="page__title">Results</h1>
        <p className="page__subtitle">Loading job...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results-page">
        <h1 className="results-page__title">Results</h1>
        <div className="alert alert--error" role="alert">
          {error}
        </div>
        <Link to="/builder" className="btn btn--primary">
          Back to Builder
        </Link>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="results-page">
      <h1 className="results-page__title">Simulation Results</h1>

      <SimJobStatusPanel job={job} polling={polling} />

      {viewState === 'pending' && (
        <div className="results-pending" role="status" aria-live="polite">
          <p className="results-pending__message">
            Results pending — waiting for the simulation to complete...
          </p>
          {polling && (
            <p className="results-pending__polling">Checking for updates automatically.</p>
          )}
        </div>
      )}

      {viewState === 'failed' && job.error && <SimErrorBanner error={job.error} />}

      {viewState === 'empty-results' && (
        <div className="results-empty" role="status">
          <p className="results-empty__message">
            No measurement outcomes. The job completed but produced no results.
          </p>
        </div>
      )}

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
        <Link to="/builder" className="btn btn--primary">
          Back to Builder
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExecutionResultsView — for jobs submitted via the IDE
// Uses /api/execution endpoints
// ---------------------------------------------------------------------------

function ExecutionResultsView({ jobId }: { jobId: string }) {
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
    loadJob(jobId);
  }, [jobId, loadJob]);

  useEffect(() => {
    setShowAll(false);
  }, [jobId]);

  const maxDisplay = showAll ? undefined : DEFAULT_MAX_DISPLAY;
  const canShowAll = outcomes.length > DEFAULT_MAX_DISPLAY;

  if (viewState === 'loading') {
    return (
      <div className="page">
        <h1 className="page__title">Results</h1>
        <p className="page__subtitle">Loading job...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results-page">
        <h1 className="results-page__title">Results</h1>
        <div className="alert alert--error" role="alert">
          {error}
        </div>
        <Link to="/ide" className="btn btn--primary">
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

      {isIbm && <ProviderMetadataPanel job={job} />}

      {isCancellable && (
        <CancelJobPanel cancelling={cancelling} cancelError={cancelError} onCancel={cancel} />
      )}

      {viewState === 'pending' && <PendingBanner job={job} polling={polling} />}
      {viewState === 'cancelled' && <CancelledBanner job={job} />}
      {viewState === 'failed' && job.error && (
        <ErrorBanner error={job.error} isIbm={isIbm} />
      )}

      {viewState === 'empty-results' && (
        <div className="results-empty" role="status">
          <p className="results-empty__message">
            No measurement outcomes available. The job completed but produced no results.
          </p>
        </div>
      )}

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
        <Link to="/ide" className="btn btn--primary">
          Run another circuit
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

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
  outcomes: Outcome[];
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

// ---------------------------------------------------------------------------
// Execution job sub-components
// ---------------------------------------------------------------------------

function JobStatusPanel({ job, polling }: { job: ExecutionJobResponse; polling: boolean }) {
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

function SimJobStatusPanel({ job, polling }: { job: JobResponse; polling: boolean }) {
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
        <span className="job-status-panel__value">Simulator</span>
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
  const { label, className } = config[status] ?? { label: status, className: '' };
  const isPending = ['submitted', 'queued', 'running'].includes(status);
  return (
    <span className={`status-badge ${className}`} role="status" aria-label={`Job status: ${label}`}>
      {label}
      {polling && isPending && (
        <span className="status-badge__polling" aria-label="Checking for updates">
          {' '}
          ...
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

function PendingBanner({ job, polling }: { job: ExecutionJobResponse; polling: boolean }) {
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
        <p className="results-pending__polling">Checking for updates automatically.</p>
      )}
    </div>
  );
}

function CancelledBanner({ job }: { job: ExecutionJobResponse }) {
  return (
    <div className="alert alert--warning" role="status">
      <p>
        <strong>Job was cancelled.</strong>
        {job.cancelledAt && <> Cancelled at {new Date(job.cancelledAt).toLocaleString()}.</>}
      </p>
      <p>
        <Link to="/ide">Run a new circuit</Link> to try again.
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
    IBM_EXECUTION_ERROR:
      'The hardware execution encountered an error. Try running on the simulator instead.',
    PROVIDER_UNAVAILABLE:
      'IBM Quantum is temporarily unavailable. Try again later or use the simulator.',
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

function SimErrorBanner({ error }: { error: { errorCode: string; message: string } }) {
  const guidance: Record<string, string> = {
    VALIDATION_MAX_QUBITS: 'Try reducing the number of qubits in your circuit.',
    VALIDATION_MAX_SHOTS: 'Try reducing the number of shots.',
    VALIDATION_MAX_DEPTH: 'Try simplifying your circuit to reduce gate depth.',
    VALIDATION_SYNTAX: 'Check your OpenQASM syntax for errors.',
    EXECUTION_TIMEOUT: 'Try a simpler circuit or fewer shots.',
    EXECUTION_RUNTIME_ERROR: 'Check your circuit for errors and try again.',
  };
  const hint = guidance[error.errorCode];
  return (
    <div className="error-banner" role="alert">
      <div className="error-banner__header">Simulation Failed</div>
      <p className="error-banner__message">{error.message}</p>
      {hint && <p className="error-banner__hint">{hint}</p>}
      <details className="error-banner__details">
        <summary className="error-banner__details-toggle">Error details</summary>
        <p className="error-banner__code">Error code: {error.errorCode}</p>
      </details>
    </div>
  );
}
