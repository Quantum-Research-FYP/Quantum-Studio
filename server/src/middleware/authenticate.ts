import type { Request, Response, NextFunction } from 'express';
import type pg from 'pg';
import { getSessionIdFromRequest, getValidSession } from '../auth/session.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Middleware that attaches `req.user` if a valid session cookie is present.
 * Does NOT block the request — downstream handlers decide whether auth is required.
 */
export function createAuthMiddleware(pool: pg.Pool) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const sessionId = getSessionIdFromRequest(req);
    if (!sessionId) {
      next();
      return;
    }

    try {
      const session = await getValidSession(pool, sessionId);
      if (!session) {
        next();
        return;
      }

      const userResult = await pool.query<{ id: string; email: string }>(
        'SELECT id, email FROM users WHERE id = $1',
        [session.user_id],
      );

      if (userResult.rows[0]) {
        req.user = userResult.rows[0];
      }
    } catch (err) {
      console.error('Auth middleware error:', err);
    }

    next();
  };
}

/** Route-level guard that returns 401 if `req.user` is not set. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  next();
}
