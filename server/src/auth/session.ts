/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Request, Response } from 'express';

const SESSION_COOKIE_NAME = 'sid';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/** Create a new session row and set the session cookie on the response. */
export async function createSession(
  pool: any,
  userId: string,
  req: Request,
  res: Response,
): Promise<string> {
  const maxAgeMs = parseInt(process.env.SESSION_MAX_AGE_MS || '', 10) || DEFAULT_MAX_AGE_MS;
  const expiresAt = new Date(Date.now() + maxAgeMs);
  const ip = req.ip || req.socket.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  const result = await (pool as any).query(
    `INSERT INTO sessions (user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, expiresAt, ip, userAgent],
  );

  const sessionId = result.rows[0].id;
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  });

  return sessionId;
}

/** Look up a valid (non-expired, non-revoked) session by its cookie ID. */
export async function getValidSession(
  pool: any,
  sessionId: string,
): Promise<SessionRow | null> {
  const result = await (pool as any).query(
    `SELECT id, user_id, expires_at, revoked_at
     FROM sessions
     WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId],
  );

  return result.rows[0] ?? null;
}

/** Revoke a session (server-side logout). */
export async function revokeSession(pool: any, sessionId: string): Promise<void> {
  await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
}

/** Clear the session cookie from the response. */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

/** Read the session ID from the request cookies. */
export function getSessionIdFromRequest(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE_NAME];
}
