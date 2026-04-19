import { useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSimulation } from '../hooks/useSimulation';
import type { JobResponse, JobResultResponse } from '../api/simulations';

export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const { job, result, error, loading, polling, loadJob } = useSimulation();

  useEffect(() => {
    if (jobId) {
      loadJob(jobId);
    }
  }, [jobId, loadJob]);

  if (!jobId) {
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

  if (loading) {
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

      {job.status === 'completed' && result && <CountsTable result={result} />}

      {job.status === 'failed' && job.error && <ErrorBanner error={job.error} />}

      <div className="results-page__actions">
        <Link to="/run" className="btn btn--primary">
          Run another simulation
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
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
          ...
        </span>
      )}
    </span>
  );
}

function CountsTable({ result }: { result: JobResultResponse }) {
  const rows = useMemo(() => {
    const totalShots = Object.values(result.counts).reduce((sum, c) => sum + c, 0);
    return Object.entries(result.counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bitstring, count]) => ({
        bitstring,
        count,
        probability: totalShots > 0 ? count / totalShots : 0,
      }));
  }, [result.counts]);

  const metadata = result.metadata as { durationMs?: number; backend?: string };

  return (
    <div className="counts-table-wrapper">
      <h2 className="counts-table__title">Measurement Counts</h2>
      {metadata.durationMs !== undefined && (
        <p className="counts-table__meta">Completed in {metadata.durationMs.toLocaleString()} ms</p>
      )}
      <table className="counts-table" aria-label="Simulation measurement counts">
        <thead>
          <tr>
            <th scope="col">Bitstring</th>
            <th scope="col" className="counts-table__num">
              Count
            </th>
            <th scope="col" className="counts-table__num">
              Probability
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.bitstring}>
              <td>
                <code>{row.bitstring}</code>
              </td>
              <td className="counts-table__num">{row.count.toLocaleString()}</td>
              <td className="counts-table__num">{(row.probability * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <p className="error-banner__code">Error code: {error.errorCode}</p>
    </div>
  );
}
