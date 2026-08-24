import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import { v4 as uuid } from 'uuid';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

const SESSION_COOKIE_NAME = 'sid';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/** Create a new session document and set the session cookie on the response. */
export async function createSession(
  pool: Db,
  userId: string,
  req: Request,
  res: Response,
): Promise<string> {
  const maxAgeMs = parseInt(process.env.SESSION_MAX_AGE_MS || '', 10) || DEFAULT_MAX_AGE_MS;
  const expiresAt = new Date(Date.now() + maxAgeMs);
  const ip = req.ip || req.socket.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  const sessionId = uuid();
  const sessions = pool.collection<AppDocument>(COLLECTIONS.SESSIONS);

  await sessions.insertOne({
    _id: sessionId,
    userId,
    expiresAt,
    revokedAt: null,
    ip,
    userAgent,
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    // Cross-site deployments (Vercel frontend ↔ Render backend) require
    // sameSite:'none' + secure:true so browsers include the cookie on
    // cross-origin API calls. Locally we keep 'lax' (no HTTPS needed).
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  });

  return sessionId;
}

/** Look up a valid (non-expired, non-revoked) session by its cookie ID. */
export async function getValidSession(pool: Db, sessionId: string): Promise<SessionRow | null> {
  const sessions = pool.collection<AppDocument>(COLLECTIONS.SESSIONS);

  const doc = await sessions.findOne({
    _id: sessionId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!doc) return null;

  return {
    id: doc._id as string,
    user_id: doc.userId as string,
    expires_at: doc.expiresAt as Date,
    revoked_at: null,
  };
}

/** Revoke a session (server-side logout). */
export async function revokeSession(pool: Db, sessionId: string): Promise<void> {
  const sessions = pool.collection<AppDocument>(COLLECTIONS.SESSIONS);
  await sessions.updateOne(
    { _id: sessionId },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } },
  );
}

/** Clear the session cookie from the response. */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

/** Read the session ID from the request cookies. */
export function getSessionIdFromRequest(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE_NAME];
}
