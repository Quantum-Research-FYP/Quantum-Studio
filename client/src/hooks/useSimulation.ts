import { useState, useEffect, useCallback, useRef } from 'react';
import {
  submitJob,
  getJobStatus,
  getJobResult,
  type JobResponse,
  type JobResultResponse,
  type SubmitJobInput,
} from '../api/simulations';

const POLL_INTERVAL_MS = 2000;

interface UseSimulationState {
  /** Current job metadata (status, timestamps, error info). */
  job: JobResponse | null;
  /** Structured results when the job completes. */
  result: JobResultResponse | null;
  /** User-facing error message (submission or polling failure). */
  error: string | null;
  /** True while a submit or initial status fetch is in-flight. */
  loading: boolean;
  /** True while polling for status updates. */
  polling: boolean;
}

interface UseSimulationReturn extends UseSimulationState {
  /** Submit a new simulation job. */
  submit: (input: SubmitJobInput) => Promise<void>;
  /** Load an existing job by ID (e.g. from URL params). */
  loadJob: (jobId: string) => Promise<void>;
  /** Reset state to initial. */
  reset: () => void;
}

export function useSimulation(): UseSimulationReturn {
  const [state, setState] = useState<UseSimulationState>({
    job: null,
    result: null,
    error: null,
    loading: false,
    polling: false,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (mountedRef.current) {
      setState((s) => ({ ...s, polling: false }));
    }
  }, []);

  /** Start polling for job status. */
  const startPolling = useCallback(
    (jobId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      setState((s) => ({ ...s, polling: true }));

      pollRef.current = setInterval(async () => {
        try {
          const updatedJob = await getJobStatus(jobId);
          if (!mountedRef.current) return;

          setState((s) => ({ ...s, job: updatedJob }));

          if (updatedJob.status === 'completed') {
            stopPolling();
            try {
              const jobResult = await getJobResult(jobId);
              if (mountedRef.current) {
                setState((s) => ({ ...s, result: jobResult }));
              }
            } catch {
              // Result fetch failed — job status already shows completed
            }
          } else if (updatedJob.status === 'failed') {
            stopPolling();
          }
        } catch {
          // Silently continue polling on transient errors
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  const submit = useCallback(
    async (input: SubmitJobInput) => {
      stopPolling();
      setState({ job: null, result: null, error: null, loading: true, polling: false });

      try {
        const job = await submitJob(input);
        if (!mountedRef.current) return;

        setState((s) => ({ ...s, job, loading: false }));

        if (job.status === 'queued' || job.status === 'running') {
          startPolling(job.jobId);
        } else if (job.status === 'completed') {
          try {
            const jobResult = await getJobResult(job.jobId);
            if (mountedRef.current) {
              setState((s) => ({ ...s, result: jobResult }));
            }
          } catch {
            // Result fetch failed
          }
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to submit simulation job.';
        setState((s) => ({ ...s, error: message, loading: false }));
      }
    },
    [startPolling, stopPolling],
  );

  const loadJob = useCallback(
    async (jobId: string) => {
      stopPolling();
      setState({ job: null, result: null, error: null, loading: true, polling: false });

      try {
        const job = await getJobStatus(jobId);
        if (!mountedRef.current) return;

        setState((s) => ({ ...s, job, loading: false }));

        if (job.status === 'queued' || job.status === 'running') {
          startPolling(job.jobId);
        } else if (job.status === 'completed') {
          try {
            const jobResult = await getJobResult(jobId);
            if (mountedRef.current) {
              setState((s) => ({ ...s, result: jobResult }));
            }
          } catch {
            // Result fetch failed
          }
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load job.';
        setState((s) => ({ ...s, error: message, loading: false }));
      }
    },
    [startPolling, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setState({ job: null, result: null, error: null, loading: false, polling: false });
  }, [stopPolling]);

  return { ...state, submit, loadJob, reset };
}
