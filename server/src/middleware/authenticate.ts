import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import { getSessionIdFromRequest, getValidSession } from '../auth/session.js';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Middleware that attaches `req.user` if a valid session cookie is present.
 * Does NOT block the request — downstream handlers decide whether auth is required.
 */
export function createAuthMiddleware(pool: Db) {
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

      const users = pool.collection<AppDocument>(COLLECTIONS.USERS);
      const user = await users.findOne(
        { _id: session.user_id },
        { projection: { _id: 1, email: 1 } },
      );

      if (user) {
        req.user = { id: user._id as string, email: user.email as string };
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
