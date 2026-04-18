import type { Request, Response } from 'express';
import type pg from 'pg';
import { hashPassword, verifyPassword, validatePassword } from './password.js';
import {
  createSession,
  revokeSession,
  clearSessionCookie,
  getSessionIdFromRequest,
} from './session.js';

/** Normalise email: trim whitespace and lowercase. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Basic RFC-5322-ish email format check. */
function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createAuthHandlers(pool: pg.Pool) {
  return {
    /** POST /api/auth/signup */
    async signup(req: Request, res: Response): Promise<void> {
      try {
        const { email: rawEmail, password } = req.body ?? {};

        if (!rawEmail || !password) {
          res.status(400).json({ error: 'Email and password are required.' });
          return;
        }

        const email = normalizeEmail(rawEmail);

        if (!isValidEmailFormat(email)) {
          res.status(400).json({ error: 'Invalid email format.' });
          return;
        }

        const passwordCheck = validatePassword(password);
        if (!passwordCheck.valid) {
          res.status(400).json({ error: passwordCheck.message });
          return;
        }

        const passwordHash = await hashPassword(password);

        try {
          await pool.query(`INSERT INTO users (email, password_hash) VALUES ($1, $2)`, [
            email,
            passwordHash,
          ]);
        } catch (err: unknown) {
          const pgError = err as { code?: string };
          if (pgError.code === '23505') {
            // Unique violation — email already registered
            res
              .status(409)
              .json({ error: 'An account with this email already exists.', action: 'login' });
            return;
          }
          throw err;
        }

        const userResult = await pool.query<{ id: string; email: string }>(
          'SELECT id, email FROM users WHERE email = $1',
          [email],
        );
        const user = userResult.rows[0];

        await createSession(pool, user.id, req, res);

        res.status(201).json({ user: { id: user.id, email: user.email } });
      } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** POST /api/auth/login */
    async login(req: Request, res: Response): Promise<void> {
      const GENERIC_ERROR = 'Invalid email or password.';

      try {
        const { email: rawEmail, password } = req.body ?? {};

        if (!rawEmail || !password) {
          res.status(400).json({ error: 'Email and password are required.' });
          return;
        }

        const email = normalizeEmail(rawEmail);

        const userResult = await pool.query<{
          id: string;
          email: string;
          password_hash: string;
        }>('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);

        const user = userResult.rows[0];

        if (!user) {
          // Hash a dummy password to keep response time consistent (prevent timing attacks)
          await hashPassword(password);
          res.status(401).json({ error: GENERIC_ERROR });
          return;
        }

        const valid = await verifyPassword(user.password_hash, password);
        if (!valid) {
          res.status(401).json({ error: GENERIC_ERROR });
          return;
        }

        // Update last_login_at
        await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

        await createSession(pool, user.id, req, res);

        res.status(200).json({ user: { id: user.id, email: user.email } });
      } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** POST /api/auth/logout */
    async logout(req: Request, res: Response): Promise<void> {
      try {
        const sessionId = getSessionIdFromRequest(req);
        if (sessionId) {
          await revokeSession(pool, sessionId);
        }
        clearSessionCookie(res);
        res.status(200).json({ message: 'Logged out.' });
      } catch (err) {
        console.error('Logout error:', err);
        clearSessionCookie(res);
        res.status(200).json({ message: 'Logged out.' });
      }
    },

    /** GET /api/auth/me */
    async me(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }
      res.status(200).json({ user: req.user });
    },
  };
}
