/**
 * In-memory sliding-window rate limiter keyed by user ID.
 * Tracks request timestamps and rejects requests that exceed the configured
 * maximum within the sliding window.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the user can retry (only set when blocked). */
  retryAfterSeconds?: number;
  /** Remaining requests in the current window. */
  remaining: number;
}

export interface RateLimiter {
  /** Check and record a request for the given key. */
  check(key: string): RateLimitResult;
  /** Reset all tracked state (useful for testing). */
  reset(): void;
}

/**
 * Create a sliding-window rate limiter.
 * @param maxRequests Maximum requests allowed within the window.
 * @param windowMs Window duration in milliseconds.
 */
export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
  const requestLog = new Map<string, number[]>();

  function pruneExpired(timestamps: number[], now: number): number[] {
    const cutoff = now - windowMs;
    // Find first index that is within the window
    let start = 0;
    while (start < timestamps.length && timestamps[start] <= cutoff) {
      start++;
    }
    return start === 0 ? timestamps : timestamps.slice(start);
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      let timestamps = requestLog.get(key) || [];
      timestamps = pruneExpired(timestamps, now);

      if (timestamps.length >= maxRequests) {
        // Calculate when the earliest request in the window will expire
        const oldestInWindow = timestamps[0];
        const retryAfterMs = oldestInWindow + windowMs - now;
        const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

        requestLog.set(key, timestamps);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, retryAfterSeconds),
          remaining: 0,
        };
      }

      timestamps.push(now);
      requestLog.set(key, timestamps);

      return {
        allowed: true,
        remaining: maxRequests - timestamps.length,
      };
    },

    reset(): void {
      requestLog.clear();
    },
  };
}
