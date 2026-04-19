import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSimulation } from '../hooks/useSimulation';
import type { JobResponse } from '../api/simulations';
import ProbabilityBarChart from '../components/results/ProbabilityBarChart';
import ResultsTable from '../components/results/ResultsTable';

const DEFAULT_MAX_DISPLAY = 20;

export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const { job, viewState, outcomes, error, polling, loadJob } = useSimulation();

  const [showChart, setShowChart] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (jobId) {
      loadJob(jobId);
    }
  }, [jobId, loadJob]);

  // Reset showAll when job changes
  useEffect(() => {
    setShowAll(false);
  }, [jobId]);

  // Determine whether truncation applies
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
            Run a simulation
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
        <p className="page__subtitle">Loading job…</p>
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
          Run a new simulation
        </Link>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="results-page">
      <h1 className="results-page__title">Simulation Results</h1>

      <JobStatusPanel job={job} polling={polling} />

      {/* ── pending state ──────────────────────────────────────────── */}
      {viewState === 'pending' && (
        <div className="results-pending" role="status" aria-live="polite">
          <p className="results-pending__message">
            Results pending — waiting for the simulation to complete…
          </p>
        </div>
      )}

      {/* ── failed state ───────────────────────────────────────────── */}
      {viewState === 'failed' && job.error && <ErrorBanner error={job.error} />}

      {/* ── empty-results state ────────────────────────────────────── */}
      {viewState === 'empty-results' && (
        <div className="results-empty" role="status">
          <p className="results-empty__message">
            No measurement outcomes available. The simulation completed but produced no results.
          </p>
        </div>
      )}

      {/* ── completed state: chart + table ─────────────────────────── */}
      {viewState === 'completed' && (
        <>
          <div className="results-toggles">
            <button
              type="button"
              className={`btn btn--ghost results-toggle ${showChart ? 'results-toggle--active' : ''}`}
              onClick={() => setShowChart((v) => !v)}
              aria-pressed={showChart}
            >
              {showChart ? 'Hide chart' : 'Show chart'}
            </button>
            <button
              type="button"
              className={`btn btn--ghost results-toggle ${showTable ? 'results-toggle--active' : ''}`}
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
            >
              {showTable ? 'Hide table' : 'Show table'}
            </button>
            {canShowAll && (
              <button
                type="button"
                className="btn btn--ghost results-toggle"
                onClick={() => setShowAll((v) => !v)}
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
        </>
      )}

      <div className="results-page__actions">
        <Link to="/run" className="btn btn--primary">
          Run another simulation
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (page-specific, kept inline)
// ---------------------------------------------------------------------------

function JobStatusPanel({ job, polling }: { job: JobResponse; polling: boolean }) {
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

function StatusBadge({ status, polling }: { status: string; polling: boolean }) {
  const config: Record<string, { label: string; className: string }> = {
    queued: { label: 'Queued', className: 'status-badge--queued' },
    running: { label: 'Running', className: 'status-badge--running' },
    completed: { label: 'Completed', className: 'status-badge--completed' },
    failed: { label: 'Failed', className: 'status-badge--failed' },
  };

  const { label, className } = config[status] ?? {
    label: status,
    className: '',
  };

  return (
    <span className={`status-badge ${className}`} role="status" aria-label={`Job status: ${label}`}>
      {label}
      {polling && (status === 'queued' || status === 'running') && (
        <span className="status-badge__polling" aria-label="Checking for updates">
          {' '}
          …
        </span>
      )}
    </span>
  );
}

function ErrorBanner({ error }: { error: { errorCode: string; message: string } }) {
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
