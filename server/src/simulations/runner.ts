import type { Db } from 'mongodb';
import { createSimulationRepository } from './repository.js';
import { createSpinqRepository } from '../integrations/spinq-repository.js';
import type { CodeType } from './repository.js';
import { getResourceLimits } from './validation.js';
import { getSimulationServiceUrl, fetchWithRetry, pingSimulationService } from './sim-fetch.js';

interface RunnerOptions {
  /** Max concurrent simulation processes (default: 2). */
  maxConcurrent?: number;
  /** Polling interval in ms for checking the queue (default: 1000). */
  pollIntervalMs?: number;
  /** Keep-alive ping interval in ms (default: 5 minutes). Set 0 to disable. */
  keepAliveIntervalMs?: number;
}

/** Default keep-alive interval: 5 minutes. */
const DEFAULT_KEEP_ALIVE_MS = 5 * 60 * 1000;

/**
 * Create an in-process job runner that polls for queued simulation jobs,
 * executes them via a Python subprocess, and stores results.
 */
export function createJobRunner(pool: Db, options?: RunnerOptions) {
  const repo = createSimulationRepository(pool);
  const spinqRepo = createSpinqRepository(pool);
  const maxConcurrent =
    parseInt(process.env.SIM_MAX_CONCURRENT_JOBS || '', 10) || options?.maxConcurrent || 2;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;
  const keepAliveIntervalMs = options?.keepAliveIntervalMs ?? DEFAULT_KEEP_ALIVE_MS;

  let activeJobs = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  /** Try to dequeue and run jobs up to the concurrency limit. */
  async function tryProcessQueue(): Promise<void> {
    if (stopped) return;

    while (activeJobs < maxConcurrent) {
      const job = await repo.dequeueNextJob();
      if (!job) break; // Queue is empty

      activeJobs++;
      // Run asynchronously — don't await, so we can dequeue multiple jobs
      executeJob(job.createdByUserId, job.id, job.qasmInput, job.shots, job.codeType ?? 'qasm', job.noiseConfig, job.provider).finally(() => {
        activeJobs--;
        // After a job finishes, immediately check for more work
        if (!stopped) tryProcessQueue().catch(logError);
      });
    }
  }

  /** Execute a single simulation job via Python subprocess. */
  async function executeJob(userId: string, jobId: string, qasmInput: string, shots: number, codeType: CodeType = 'qasm', noiseConfig?: Record<string, any>, provider?: string): Promise<void> {
    const limits = getResourceLimits();
    const timeoutMs = limits.maxExecutionTimeSeconds * 1000;

    try {
      let spinqConfig;
      if (provider === 'spinq') {
        const settings = await spinqRepo.getFullSettings(userId);
        if (settings) {
          spinqConfig = settings;
        }
      }

      const result = await runPythonSimulation(qasmInput, shots, timeoutMs, codeType, noiseConfig, provider, spinqConfig);

      if (result.error) {
        await repo.transitionStatus(jobId, 'failed', {
          errorCode: result.errorCode,
          errorMessageSafe: result.message,
        });
        return;
      }

      // Store results and transition to completed
      await repo.storeResult({
        jobId,
        counts: result.counts,
        metadata: result.metadata,
      });

      await repo.transitionStatus(jobId, 'completed');
    } catch (err) {
      // Catch-all: map any unexpected error to a safe message
      const message =
        err instanceof Error && err.message === 'EXECUTION_TIMEOUT'
          ? `Simulation exceeded the ${limits.maxExecutionTimeSeconds}s time limit.`
          : 'An unexpected error occurred during simulation.';
      const errorCode =
        err instanceof Error && err.message === 'EXECUTION_TIMEOUT'
          ? 'EXECUTION_TIMEOUT'
          : 'EXECUTION_RUNTIME_ERROR';

      await repo
        .transitionStatus(jobId, 'failed', {
          errorCode,
          errorMessageSafe: message,
        })
        .catch(logError);
    }
  }

  // -------------------------------------------------------------------------
  // Keep-alive: periodically ping the simulation service to prevent cold starts
  // -------------------------------------------------------------------------

  async function keepAlivePing(): Promise<void> {
    // Skip pinging while a job is actively running — service is obviously warm.
    if (activeJobs > 0) return;

    const ok = await pingSimulationService();
    if (ok) {
      console.log('[keep-alive] Simulation service is responsive.');
    } else {
      console.warn('[keep-alive] Simulation service is unreachable — it may be cold-starting.');
    }
  }

  return {
    /** Start the polling loop and the keep-alive pinger. */
    start(): void {
      if (pollTimer) return;
      stopped = false;

      // Job queue polling
      pollTimer = setInterval(() => {
        tryProcessQueue().catch(logError);
      }, pollIntervalMs);
      // Also run immediately on start to pick up any jobs left from a prior run
      tryProcessQueue().catch(logError);

      // Keep-alive pinging (prevents Render free-tier spin-down)
      if (keepAliveIntervalMs > 0) {
        // Fire an initial ping on startup so the service is warm ASAP
        keepAlivePing().catch(logError);
        keepAliveTimer = setInterval(() => {
          keepAlivePing().catch(logError);
        }, keepAliveIntervalMs);
      }
    },

    /** Stop the polling loop and keep-alive. Active jobs will still finish. */
    stop(): void {
      stopped = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    },

    /** Nudge the runner to check the queue immediately (called after job submission). */
    nudge(): void {
      if (!stopped) tryProcessQueue().catch(logError);
    },

    /** Current number of active simulation processes. */
    get activeCount(): number {
      return activeJobs;
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP simulation service client
// ---------------------------------------------------------------------------

interface SimulationSuccess {
  error?: false;
  counts: Record<string, number>;
  metadata: Record<string, unknown>;
}

interface SimulationError {
  error: true;
  errorCode: string;
  message: string;
}

type SimulationResult = SimulationSuccess | SimulationError;

/** Call the FastAPI simulation microservice via HTTP with retry logic. */
async function runPythonSimulation(
  qasmInput: string,
  shots: number,
  timeoutMs: number,
  codeType: CodeType = 'qasm',
  noiseConfig?: Record<string, any>,
  provider?: string,
  spinqConfig?: Record<string, any>
): Promise<SimulationResult> {
  const serviceUrl = getSimulationServiceUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchWithRetry(
      `${serviceUrl}/simulate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qasm: qasmInput, shots, mode: codeType, noiseConfig, provider: provider || 'simulator', spinqConfig }),
      },
      { signal: controller.signal },
    );

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const detail = (data.detail ?? {}) as Record<string, unknown>;
      return {
        error: true,
        errorCode: typeof detail.errorCode === 'string' ? detail.errorCode : 'EXECUTION_RUNTIME_ERROR',
        message: typeof detail.message === 'string' ? detail.message : 'Simulation service returned an error.',
      };
    }

    return data as unknown as SimulationSuccess;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('EXECUTION_TIMEOUT');
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Simulation service unreachable after retries:', msg);
    return {
      error: true,
      errorCode: 'EXECUTION_RUNTIME_ERROR',
      message: 'Cannot reach the simulation service. Is it running?',
    };
  } finally {
    clearTimeout(timer);
  }
}

function logError(err: unknown): void {
  console.error('Job runner error:', err instanceof Error ? err.message : err);
}
