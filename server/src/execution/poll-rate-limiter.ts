/**
 * Per-user polling rate limiter for execution job status endpoints.
 * Uses a sliding window to prevent excessive polling of provider APIs.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_POLLS = parseInt(process.env.EXECUTION_POLL_RATE_LIMIT || '30', 10);
const WINDOW_MS = parseInt(process.env.EXECUTION_POLL_RATE_WINDOW_MS || '60000', 10);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WindowEntry {
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

const userWindows = new Map<string, WindowEntry>();

/** Periodically clean up stale entries to prevent unbounded memory growth. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userWindows) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
    if (entry.timestamps.length === 0) {
      userWindows.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Check if a polling request is allowed for the given user.
 *
 * @returns `{ allowed: true }` if under the limit, or
 *          `{ allowed: false, retryAfterSeconds }` if rate limited.
 */
export function checkPollRateLimit(
  userId: string,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let entry = userWindows.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    userWindows.set(userId, entry);
  }

  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= MAX_POLLS) {
    // Calculate when the oldest timestamp in the window will expire
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + WINDOW_MS - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}
