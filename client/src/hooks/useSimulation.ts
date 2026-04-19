import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  submitJob,
  getJobStatus,
  getJobResult,
  type JobResponse,
  type JobResultResponse,
  type SubmitJobInput,
  type Outcome,
} from '../api/simulations';

const POLL_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// View-state discriminator
// ---------------------------------------------------------------------------

export type ResultsViewState =
  | 'no-job'
  | 'loading'
  | 'pending'
  | 'failed'
  | 'empty-results'
  | 'completed';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public return type
// ---------------------------------------------------------------------------

interface UseSimulationReturn extends UseSimulationState {
  /** Discriminated view-state for the results page. */
  viewState: ResultsViewState;
  /** Pre-sorted outcomes (probability desc, bitstring asc for ties). Empty for non-completed states. */
  outcomes: Outcome[];
  /** Submit a new simulation job. */
  submit: (input: SubmitJobInput) => Promise<void>;
  /** Load an existing job by ID (e.g. from URL params). */
  loadJob: (jobId: string) => Promise<void>;
  /** Reset state to initial. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely extract the counts map from a result, returning an empty object on malformed data. */
function safeCounts(result: JobResultResponse | null): Record<string, number> {
  if (!result || typeof result.counts !== 'object' || result.counts === null) return {};
  return result.counts;
}

/**
 * Build a sorted outcomes list from the result payload.
 * Uses server-provided probabilities when available, otherwise derives them
 * client-side with deterministic 4dp rounding.
 */
function buildOutcomes(result: JobResultResponse | null, jobShots: number): Outcome[] {
  const counts = safeCounts(result);
  const entries = Object.entries(counts);
  if (entries.length === 0) return [];

  const serverProbs = result?.probabilities;
  const shots = result?.shots ?? jobShots;

  const outcomes: Outcome[] = entries.map(([bitstring, count]) => {
    const probability =
      serverProbs && typeof serverProbs[bitstring] === 'number'
        ? serverProbs[bitstring]
        : shots > 0
          ? parseFloat((count / shots).toFixed(4))
          : 0;
    return { bitstring, count, probability };
  });

  // Sort: probability descending, bitstring ascending for deterministic tie-breaking
  outcomes.sort((a, b) => {
    const probDiff = b.probability - a.probability;
    if (probDiff !== 0) return probDiff;
    return a.bitstring.localeCompare(b.bitstring);
  });

  return outcomes;
}

/** Derive the view-state from internal hook state. */
function deriveViewState(state: UseSimulationState): ResultsViewState {
  if (state.loading) return 'loading';
  if (!state.job) return 'no-job';

  const { status } = state.job;

  if (status === 'queued' || status === 'running') return 'pending';
  if (status === 'failed') return 'failed';

  // completed — check for results
  if (!state.result) return 'empty-results';

  const counts = safeCounts(state.result);
  if (Object.keys(counts).length === 0) return 'empty-results';

  return 'completed';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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

  // Computed view-model
  const viewState = useMemo(() => deriveViewState(state), [state]);

  const outcomes = useMemo(
    () => buildOutcomes(state.result, state.job?.shots ?? 0),
    [state.result, state.job?.shots],
  );

  return { ...state, viewState, outcomes, submit, loadJob, reset };
}
