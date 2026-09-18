import crypto from 'node:crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'anonymous_simulation_id';
const OWNER_PREFIX = 'anonymous-simulation:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

function getAnonymousId(req: Request): string | null {
  const value = req.cookies?.[COOKIE_NAME];
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}

/** Returns the owner used for a new simulation and creates an anonymous cookie if needed. */
export function getSimulationOwner(req: Request, res: Response): string {
  if (req.user) return req.user.id;

  const anonymousId = getAnonymousId(req) ?? crypto.randomUUID();
  if (!getAnonymousId(req)) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(COOKIE_NAME, anonymousId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: MAX_AGE_MS,
      path: '/',
    });
  }

  return `${OWNER_PREFIX}${anonymousId}`;
}

/** Checks ownership without creating a new anonymous browser identity. */
export function canAccessSimulation(req: Request, createdByUserId: string): boolean {
  if (req.user && createdByUserId === req.user.id) return true;
  const anonymousId = getAnonymousId(req);
  return anonymousId !== null && createdByUserId === `${OWNER_PREFIX}${anonymousId}`;
}
