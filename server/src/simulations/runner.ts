/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulationRepository } from './repository.js';
import { getResourceLimits } from './validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIMULATE_SCRIPT = path.join(__dirname, 'simulate.py');

/** Resolve the Python binary inside the project venv, or fall back to system python3. */
function getPythonPath(): string {
  const venvPython = path.resolve(__dirname, '..', '..', '.venv', 'bin', 'python3');
  return venvPython;
}

interface RunnerOptions {
  /** Max concurrent simulation processes (default: 2). */
  maxConcurrent?: number;
  /** Polling interval in ms for checking the queue (default: 1000). */
  pollIntervalMs?: number;
}

/**
 * Create an in-process job runner that polls for queued simulation jobs,
 * executes them via a Python subprocess, and stores results.
 */
export function createJobRunner(pool: any, options?: RunnerOptions) {
  const repo = createSimulationRepository(pool);
  const maxConcurrent =
    parseInt(process.env.SIM_MAX_CONCURRENT_JOBS || '', 10) || options?.maxConcurrent || 2;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;

  let activeJobs = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  /** Try to dequeue and run jobs up to the concurrency limit. */
  async function tryProcessQueue(): Promise<void> {
    if (stopped) return;

    while (activeJobs < maxConcurrent) {
      const job = await repo.dequeueNextJob();
      if (!job) break; // Queue is empty

      activeJobs++;
      // Run asynchronously — don't await, so we can dequeue multiple jobs
      executeJob(job.id, job.qasmInput, job.shots).finally(() => {
        activeJobs--;
        // After a job finishes, immediately check for more work
        if (!stopped) tryProcessQueue().catch(logError);
      });
    }
  }

  /** Execute a single simulation job via Python subprocess. */
  async function executeJob(jobId: string, qasmInput: string, shots: number): Promise<void> {
    const limits = getResourceLimits();
    const timeoutMs = limits.maxExecutionTimeSeconds * 1000;

    try {
      const result = await runPythonSimulation(qasmInput, shots, timeoutMs);

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

  return {
    /** Start the polling loop. */
    start(): void {
      if (pollTimer) return;
      stopped = false;
      pollTimer = setInterval(() => {
        tryProcessQueue().catch(logError);
      }, pollIntervalMs);
      // Also run immediately on start to pick up any jobs left from a prior run
      tryProcessQueue().catch(logError);
    },

    /** Stop the polling loop. Active jobs will still finish. */
    stop(): void {
      stopped = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
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
// Python subprocess execution
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

/**
 * Spawn the Python simulation script with the given QASM input and shots.
 * Enforces a hard timeout by killing the process.
 */
function runPythonSimulation(
  qasmInput: string,
  shots: number,
  timeoutMs: number,
): Promise<SimulationResult> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const child = spawn(pythonPath, [SIMULATE_SCRIPT, '--shots', String(shots)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 0, // We handle timeout manually for cleaner error reporting
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Write QASM to stdin and close it
    child.stdin.write(qasmInput);
    child.stdin.end();

    child.on('close', (code) => {
      clearTimeout(timer);

      if (killed) {
        reject(new Error('EXECUTION_TIMEOUT'));
        return;
      }

      if (code !== 0 && !stdout.trim()) {
        // Process crashed without producing output
        console.error(
          `Simulation process exited with code ${code}. stderr (redacted):`,
          stderr.slice(0, 200),
        );
        resolve({
          error: true,
          errorCode: 'EXECUTION_RUNTIME_ERROR',
          message: 'The simulation process terminated unexpectedly.',
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed as SimulationResult);
      } catch {
        console.error('Failed to parse simulation output:', stdout.slice(0, 200));
        resolve({
          error: true,
          errorCode: 'EXECUTION_RUNTIME_ERROR',
          message: 'The simulation produced invalid output.',
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error('Failed to spawn simulation process:', err.message);
      resolve({
        error: true,
        errorCode: 'EXECUTION_RUNTIME_ERROR',
        message: 'Failed to start the simulation process.',
      });
    });
  });
}

function logError(err: unknown): void {
  console.error('Job runner error:', err instanceof Error ? err.message : err);
}
