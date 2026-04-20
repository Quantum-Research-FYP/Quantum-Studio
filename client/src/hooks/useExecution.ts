import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getExecutionJobStatus,
  cancelExecutionJob,
  type ExecutionJobResponse,
} from '../api/execution';
import { getJobResult, type JobResultResponse, type Outcome } from '../api/simulations';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 3000;
const MIN_POLL_INTERVAL_MS = 2000;
const MAX_POLL_INTERVAL_MS = 60000;

// ---------------------------------------------------------------------------
// View-state discriminator
// ---------------------------------------------------------------------------

export type ExecutionViewState =
  | 'no-job'
  | 'loading'
  | 'pending'
  | 'cancelled'
  | 'failed'
  | 'empty-results'
  | 'completed';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface UseExecutionState {
  job: ExecutionJobResponse | null;
  result: JobResultResponse | null;
  error: string | null;
  loading: boolean;
  polling: boolean;
  cancelling: boolean;
  cancelError: string | null;
}

// ---------------------------------------------------------------------------
// Public return type
// ---------------------------------------------------------------------------

export interface UseExecutionReturn extends UseExecutionState {
  viewState: ExecutionViewState;
  outcomes: Outcome[];
  loadJob: (jobId: string) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const PENDING_STATUSES = new Set(['submitted', 'queued', 'running']);

function safeCounts(result: JobResultResponse | null): Record<string, number> {
  if (!result || typeof result.counts !== 'object' || result.counts === null) return {};
  return result.counts;
}

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

  outcomes.sort((a, b) => {
    const probDiff = b.probability - a.probability;
    if (probDiff !== 0) return probDiff;
    return a.bitstring.localeCompare(b.bitstring);
  });

  return outcomes;
}

function deriveViewState(state: UseExecutionState): ExecutionViewState {
  if (state.loading) return 'loading';
  if (!state.job) return 'no-job';

  const { status } = state.job;

  if (PENDING_STATUSES.has(status)) return 'pending';
  if (status === 'cancelled') return 'cancelled';
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

export function useExecution(): UseExecutionReturn {
  const [state, setState] = useState<UseExecutionState>({
    job: null,
    result: null,
    error: null,
    loading: false,
    polling: false,
    cancelling: false,
    cancelError: null,
  });

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(DEFAULT_POLL_INTERVAL_MS);
  const mountedRef = useRef(true);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (mountedRef.current) {
      setState((s) => ({ ...s, polling: false }));
    }
  }, []);

  const schedulePoll = useCallback(
    (jobId: string, delayMs: number) => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

      pollTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;

        try {
          const updatedJob = await getExecutionJobStatus(jobId);
          if (!mountedRef.current) return;

          setState((s) => ({ ...s, job: updatedJob }));

          // Reset backoff on successful fetch
          pollIntervalRef.current = DEFAULT_POLL_INTERVAL_MS;

          if (TERMINAL_STATUSES.has(updatedJob.status)) {
            stopPolling();

            // Fetch results if completed
            if (updatedJob.status === 'completed') {
              try {
                const jobResult = await getJobResult(jobId);
                if (mountedRef.current) {
                  setState((s) => ({ ...s, result: jobResult }));
                }
              } catch {
                // Result fetch failed — status already shows completed
              }
            }
          } else {
            // Schedule next poll
            schedulePoll(jobId, pollIntervalRef.current);
          }
        } catch (err: unknown) {
          if (!mountedRef.current) return;

          // Handle 429 rate limiting with backoff
          const apiErr = err as { status?: number };
          if (apiErr.status === 429) {
            // Extract Retry-After from error or use exponential backoff
            const retryAfter = extractRetryAfter(err);
            pollIntervalRef.current = Math.min(
              retryAfter || pollIntervalRef.current * 2,
              MAX_POLL_INTERVAL_MS,
            );
          } else {
            // Back off on other transient errors
            pollIntervalRef.current = Math.min(
              pollIntervalRef.current * 1.5,
              MAX_POLL_INTERVAL_MS,
            );
          }

          // Continue polling despite error (graceful degradation)
          schedulePoll(jobId, pollIntervalRef.current);
        }
      }, delayMs);
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      pollIntervalRef.current = DEFAULT_POLL_INTERVAL_MS;
      setState((s) => ({ ...s, polling: true }));
      schedulePoll(jobId, MIN_POLL_INTERVAL_MS);
    },
    [schedulePoll],
  );

  const loadJob = useCallback(
    async (jobId: string) => {
      stopPolling();
      jobIdRef.current = jobId;
      setState({
        job: null,
        result: null,
        error: null,
        loading: true,
        polling: false,
        cancelling: false,
        cancelError: null,
      });

      try {
        const job = await getExecutionJobStatus(jobId);
        if (!mountedRef.current) return;

        setState((s) => ({ ...s, job, loading: false }));

        if (PENDING_STATUSES.has(job.status)) {
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

  const cancel = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    setState((s) => ({ ...s, cancelling: true, cancelError: null }));

    try {
      const updatedJob = await cancelExecutionJob(jobId);
      if (!mountedRef.current) return;

      stopPolling();
      setState((s) => ({
        ...s,
        job: { ...s.job!, ...updatedJob },
        cancelling: false,
      }));
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const apiErr = err as { message?: string; errorCode?: string };
      const message = apiErr.message || 'Failed to cancel job.';
      setState((s) => ({ ...s, cancelling: false, cancelError: message }));
    }
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    jobIdRef.current = null;
    setState({
      job: null,
      result: null,
      error: null,
      loading: false,
      polling: false,
      cancelling: false,
      cancelError: null,
    });
  }, [stopPolling]);

  const viewState = useMemo(() => deriveViewState(state), [state]);

  const outcomes = useMemo(
    () => buildOutcomes(state.result, state.job?.shots ?? 0),
    [state.result, state.job?.shots],
  );

  return { ...state, viewState, outcomes, loadJob, cancel, reset };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Extract retry delay (ms) from a 429 error, defaulting to exponential backoff base. */
function extractRetryAfter(err: unknown): number | null {
  const apiErr = err as { retryAfterSeconds?: number };
  if (typeof apiErr.retryAfterSeconds === 'number') {
    return apiErr.retryAfterSeconds * 1000;
  }
  return null;
}
