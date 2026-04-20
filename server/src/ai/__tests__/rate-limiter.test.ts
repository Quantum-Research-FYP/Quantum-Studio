import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter } from '../rate-limiter.js';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows requests within the limit', () => {
    const limiter = createRateLimiter(3, 60000);

    const r1 = limiter.check('user-1');
    const r2 = limiter.check('user-1');
    const r3 = limiter.check('user-1');

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests exceeding the limit', () => {
    const limiter = createRateLimiter(2, 60000);

    limiter.check('user-1');
    limiter.check('user-1');
    const r3 = limiter.check('user-1');

    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks users independently', () => {
    const limiter = createRateLimiter(1, 60000);

    const r1 = limiter.check('user-1');
    const r2 = limiter.check('user-2');
    const r3 = limiter.check('user-1');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
  });

  it('allows requests after the window expires', () => {
    const limiter = createRateLimiter(1, 1000);
    const now = Date.now();

    vi.spyOn(Date, 'now').mockReturnValue(now);
    limiter.check('user-1');

    // Move time forward past the window
    vi.spyOn(Date, 'now').mockReturnValue(now + 1001);
    const result = limiter.check('user-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('calculates retryAfterSeconds correctly', () => {
    const limiter = createRateLimiter(1, 10000);
    const now = Date.now();

    vi.spyOn(Date, 'now').mockReturnValue(now);
    limiter.check('user-1');

    // 3 seconds later, try again
    vi.spyOn(Date, 'now').mockReturnValue(now + 3000);
    const result = limiter.check('user-1');

    expect(result.allowed).toBe(false);
    // Should suggest retrying after ~7 seconds (window is 10s, 3s have passed)
    expect(result.retryAfterSeconds).toBe(7);
  });

  it('reset clears all tracked state', () => {
    const limiter = createRateLimiter(1, 60000);

    limiter.check('user-1');
    const blocked = limiter.check('user-1');
    expect(blocked.allowed).toBe(false);

    limiter.reset();

    const afterReset = limiter.check('user-1');
    expect(afterReset.allowed).toBe(true);
  });
});
