// ---------------------------------------------------------------------------
// Shared HTTP utilities for communicating with the simulation microservice
// ---------------------------------------------------------------------------

/**
 * Centralised simulation-service URL resolution.
 * Used by runner.ts, handlers.ts, and ibm-client.ts so the value is never
 * duplicated.
 */
export function getSimulationServiceUrl(): string {
  return (process.env.SIMULATION_SERVICE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Retry with exponential back-off
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retry attempts *after* the first failure (default: 3). */
  maxRetries?: number;
  /** Initial back-off delay in ms (default: 1000).  Doubles each attempt. */
  initialDelayMs?: number;
  /** Abort signal — forwarded to each fetch attempt. */
  signal?: AbortSignal;
}

/**
 * Wrapper around `fetch()` that retries on **network-level** errors
 * (connection refused, DNS failure, socket hang-up, etc.).
 *
 * It does **not** retry on HTTP error responses (4xx / 5xx) because those
 * mean the service is reachable and returned a meaningful error.
 *
 * Back-off schedule (defaults):  1 s → 2 s → 4 s  (3 retries).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3;
  const initialDelayMs = opts?.initialDelayMs ?? 1_000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Replace the signal on each attempt so retries aren't
      // aborted by a previously-consumed signal.
      const response = await fetch(url, { ...init, signal: opts?.signal });
      return response; // Success (even 4xx/5xx — caller handles those)
    } catch (err: unknown) {
      lastError = err;

      // If the caller's AbortController fired, propagate immediately — no retry.
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }

      // Only retry on network-level errors.
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.warn(
          `[sim-fetch] Attempt ${attempt + 1}/${maxRetries + 1} failed — ` +
          `retrying in ${delay}ms …  (${err instanceof Error ? err.message : String(err)})`,
        );
        await sleep(delay);
      }
    }
  }

  // All attempts exhausted — throw the last network error.
  throw lastError;
}

// ---------------------------------------------------------------------------
// Keep-alive / health-check ping
// ---------------------------------------------------------------------------

/**
 * Send a lightweight `GET /health` ping to the simulation service.
 * Returns `true` if the service responded (any status), `false` on
 * network error.  Never throws.
 */
export async function pingSimulationService(): Promise<boolean> {
  const serviceUrl = getSimulationServiceUrl();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch(`${serviceUrl}/health`, { signal: controller.signal });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
