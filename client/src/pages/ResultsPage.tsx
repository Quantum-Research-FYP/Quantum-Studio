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
import { TranspilationPanel } from '../components/results/TranspilationPanel';

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
    <div
      className="page"
      style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'left', padding: '40px 24px' }}
    >
      <style>{`
        .run-history-premium-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 24px;
        }
        
        .run-history-premium-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .run-history-premium-card {
          background: rgba(13, 22, 39, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.15s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          cursor: pointer;
        }

        .run-history-premium-card:hover {
          background: rgba(13, 22, 39, 0.8);
          border-color: rgba(34, 211, 238, 0.4);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), inset 2px 0 0 rgba(34, 211, 238, 0.6);
        }

        .run-card-left {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .run-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .run-card-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .status-pill--completed { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .status-pill--running { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
        .status-pill--failed { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .status-pill--queued { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .status-pill--cancelled { background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
        .status-pill--submitted { background: rgba(139, 92, 246, 0.15); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }

        .run-card-title {
          font-size: 1rem;
          font-weight: 600;
          color: #fff;
          margin: 0;
        }
        
        .run-card-meta {
          display: flex;
          gap: 16px;
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }

        .run-card-meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .run-card-meta-icon {
          opacity: 0.7;
        }

        .run-card-right {
          display: flex;
          align-items: center;
          gap: 32px;
          text-align: right;
        }

        .run-card-dates {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .date-label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .date-value {
          font-size: 0.9rem;
          color: #e2e8f0;
          font-variant-numeric: tabular-nums;
        }
        
        .run-card-action {
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.2s ease;
        }
        
        .run-history-premium-card:hover .run-card-action {
          opacity: 1;
          transform: translateX(0);
        }
      `}</style>

      <div className="run-history-premium-header">
        <div>
          <h1 className="page__title" style={{ textAlign: 'left', marginBottom: '8px' }}>
            Run History
          </h1>
          <p
            className="page__subtitle"
            style={{
              textAlign: 'left',
              color: 'var(--color-text-muted)',
              fontSize: '1.1rem',
              margin: 0,
            }}
          >
            A complete log of your quantum circuit executions on simulators and hardware.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/builder" className="btn btn--ghost">
            Builder
          </Link>
          <Link to="/ide" className="btn btn--primary">
            Run Circuit
          </Link>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p>Loading run history…</p>
        </div>
      )}

      {error && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div
          style={{
            padding: '80px 0',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '16px',
            border: '1px dashed rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ opacity: 0.5, marginBottom: '16px' }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
          <h3 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '8px' }}>No runs yet</h3>
          <p
            style={{
              color: 'var(--color-text-muted)',
              marginBottom: '24px',
              maxWidth: '400px',
              margin: '0 auto 24px',
            }}
          >
            You haven't executed any quantum circuits. Run a circuit from the Builder or the IDE to
            see your history here.
          </p>
          <Link to="/ide" className="btn btn--primary">
            Get Started in IDE
          </Link>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="run-history-premium-list">
          {jobs.map((job) => (
            <div
              key={job.jobId}
              className="run-history-premium-card"
              onClick={() => navigate(`/results?jobId=${job.jobId}`)}
            >
              <div className="run-card-left">
                <div className="run-card-header">
                  <span className={`run-card-status-pill status-pill--${job.status}`}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'currentColor',
                      }}
                    ></span>
                    {job.status}
                  </span>
                  <h3 className="run-card-title">
                    {job.provider === 'ibm_quantum' ? 'IBM Quantum Hardware' : 'Local Simulator'}
                  </h3>
                </div>

                <div className="run-card-meta">
                  <div className="run-card-meta-item">
                    <span className="run-card-meta-icon" style={{ display: 'flex' }}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                    </span>
                    <span>{job.backend}</span>
                  </div>
                  <div className="run-card-meta-item">
                    <span className="run-card-meta-icon" style={{ display: 'flex' }}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="6"></circle>
                        <circle cx="12" cy="12" r="2"></circle>
                      </svg>
                    </span>
                    <span>{job.shots.toLocaleString()} shots</span>
                  </div>
                  <div className="run-card-meta-item">
                    <span className="run-card-meta-icon" style={{ display: 'flex' }}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                        <line x1="10" y1="3" x2="8" y2="21"></line>
                        <line x1="16" y1="3" x2="14" y2="21"></line>
                      </svg>
                    </span>
                    <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>
                      {job.jobId.substring(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>

              <div className="run-card-right">
                <div className="run-card-dates">
                  <span className="date-label">Submitted</span>
                  <span className="date-value">
                    {new Date(job.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {job.completedAt && (
                  <div className="run-card-dates">
                    <span className="date-label">Completed</span>
                    <span className="date-value">
                      {new Date(job.completedAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                <div className="run-card-action">
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    View Results →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
          qasm={job.qasmInput || ''}
          codeType={job.codeType || 'qasm'}
          backendName={job.backend}
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
  const { job, viewState, outcomes, error, polling, cancelling, cancelError, loadJob, cancel } =
    useExecution();

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
      {viewState === 'failed' && job.error && <ErrorBanner error={job.error} isIbm={isIbm} />}

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
          qasm={job.qasmInput || ''}
          codeType={job.codeType || 'qasm'}
          backendName={job.backend}
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
  qasm,
  codeType,
  backendName,
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
  qasm: string;
  codeType: 'qasm' | 'python';
  backendName: string;
  onToggleChart: () => void;
  onToggleTable: () => void;
  onToggleShowAll: () => void;
}) {
  const [showTranspile, setShowTranspile] = useState(false);
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
        <button
          type="button"
          className={`btn btn--ghost results-toggle ${showTranspile ? 'results-toggle--active' : ''}`}
          onClick={() => setShowTranspile((v) => !v)}
          aria-pressed={showTranspile}
        >
          {showTranspile ? 'Hide compilation trace' : 'Show compilation trace'}
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

      {showTranspile && (
        <div className="results-chart-container" style={{ marginBottom: '24px' }}>
          <h2 className="results-section__title">Transparent Transpilation Trace</h2>
          <div
            style={{
              backgroundColor: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <TranspilationPanel qasm={qasm} codeType={codeType} backendName={backendName} />
          </div>
        </div>
      )}

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
      {polling && <p className="results-pending__polling">Checking for updates automatically.</p>}
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
  const isColdStart = error.message?.toLowerCase().includes('cannot reach the simulation service');
  const guidance: Record<string, string> = {
    VALIDATION_MAX_QUBITS: 'Try reducing the number of qubits in your circuit.',
    VALIDATION_MAX_SHOTS: 'Try reducing the number of shots.',
    VALIDATION_MAX_DEPTH: 'Try simplifying your circuit to reduce gate depth.',
    VALIDATION_SYNTAX: 'Check your OpenQASM syntax for errors.',
    EXECUTION_TIMEOUT: 'Try a simpler circuit or fewer shots.',
    EXECUTION_RUNTIME_ERROR: isColdStart
      ? 'The simulation service is warming up. Please wait a moment and try again.'
      : 'Check your circuit for errors and try again.',
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
  const isColdStart = error.message?.toLowerCase().includes('cannot reach the simulation service');
  const guidance: Record<string, string> = {
    VALIDATION_MAX_QUBITS: 'Try reducing the number of qubits in your circuit.',
    VALIDATION_MAX_SHOTS: 'Try reducing the number of shots.',
    VALIDATION_MAX_DEPTH: 'Try simplifying your circuit to reduce gate depth.',
    VALIDATION_SYNTAX: 'Check your OpenQASM syntax for errors.',
    EXECUTION_TIMEOUT: 'Try a simpler circuit or fewer shots.',
    EXECUTION_RUNTIME_ERROR: isColdStart
      ? 'The simulation service is warming up. Please wait a moment and try again.'
      : 'Check your circuit for errors and try again.',
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
