import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { hashPassword, verifyPassword, validatePassword } from './password.js';
import {
  createSession,
  revokeSession,
  clearSessionCookie,
  getSessionIdFromRequest,
} from './session.js';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

/** Normalise email: trim whitespace and lowercase. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Basic RFC-5322-ish email format check. */
function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createAuthHandlers(pool: Db) {
  const users = pool.collection<AppDocument>(COLLECTIONS.USERS);

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
        const now = new Date();
        const userId = uuid();

        try {
          await users.insertOne({
            _id: userId,
            email,
            passwordHash,
            lastLoginAt: null,
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          });
        } catch (err: unknown) {
          const mongoError = err as { code?: number };
          if (mongoError.code === 11000) {
            res
              .status(409)
              .json({ error: 'An account with this email already exists.', action: 'login' });
            return;
          }
          throw err;
        }

        await createSession(pool, userId, req, res);

        res.status(201).json({ user: { id: userId, email } });
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

        const user = await users.findOne({ email });

        if (!user) {
          await hashPassword(password);
          res.status(401).json({ error: GENERIC_ERROR });
          return;
        }

        const valid = await verifyPassword(user.passwordHash as string, password);
        if (!valid) {
          res.status(401).json({ error: GENERIC_ERROR });
          return;
        }

        await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

        await createSession(pool, user._id as string, req, res);

        res.status(200).json({ user: { id: user._id, email: user.email } });
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

    /** POST /api/auth/moodle/callback */
    async moodleCallback(req: Request, res: Response): Promise<void> {
      try {
        const {
          user_id,
          username,
          email: rawEmail,
          firstname,
          lastname,
          course_id,
          timestamp,
          signature,
        } = req.body ?? {};

        const secret = process.env.MOODLE_SSO_SHARED_SECRET;
        if (!secret) {
          console.error('MOODLE_SSO_SHARED_SECRET is not configured on the server.');
          res.status(500).send('SSO Configuration Error: Shared secret is missing on the server.');
          return;
        }

        if (!user_id || !username || !rawEmail || !timestamp || !signature) {
          res.status(400).send('Missing required SSO parameters.');
          return;
        }

        // Validate timestamp to prevent replay attacks (allow 5 minutes skew)
        const requestTime = parseInt(timestamp, 10);
        const currentTime = Math.floor(Date.now() / 1000);
        if (isNaN(requestTime) || Math.abs(currentTime - requestTime) > 300) {
          res.status(400).send('SSO request expired or invalid timestamp.');
          return;
        }

        // Reconstruct query string for signature verification
        // Keys must be sorted alphabetically to match Moodle's ksort
        const payload: Record<string, string> = {
          user_id,
          username,
          email: rawEmail,
          firstname: firstname || '',
          lastname: lastname || '',
          course_id: course_id || '',
          timestamp,
        };

        const sortedKeys = Object.keys(payload).sort();
        const searchParams = new URLSearchParams();
        for (const key of sortedKeys) {
          searchParams.set(key, payload[key]);
        }

        // Compute HMAC-SHA256 signature
        const queryString = searchParams.toString();
        const computedSignature = crypto
          .createHmac('sha256', secret)
          .update(queryString)
          .digest('hex');

        console.log('--- MOODLE SSO DEBUG ---');
        console.log('Request body:', req.body);
        console.log('Secret:', secret);
        console.log('Reconstructed query string:', queryString);
        console.log('Received signature:', signature);
        console.log('Computed signature:', computedSignature);
        console.log('------------------------');

        if (computedSignature !== signature) {
          res.status(401).send('Invalid SSO signature.');
          return;
        }

        const email = rawEmail.trim().toLowerCase();
        
        // Find or create user
        let user = await users.findOne({ email });
        const now = new Date();

        if (!user) {
          const userId = uuid();
          user = {
            _id: userId,
            email,
            passwordHash: null, // SSO users don't have password hashes
            firstname: firstname || '',
            lastname: lastname || '',
            moodleUserId: user_id,
            moodleUsername: username,
            lastLoginAt: now,
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          };
          await users.insertOne(user);
        } else {
          // Update existing user with Moodle identifiers and last login date
          await users.updateOne(
            { _id: user._id },
            {
              $set: {
                lastLoginAt: now,
                moodleUserId: user_id,
                moodleUsername: username,
                updatedAt: now,
              },
            }
          );
        }

        // Create user session cookie
        await createSession(pool, user._id as string, req, res);

        // Redirect user to the frontend app dashboard
        const redirectUrl = process.env.APP_URL || 'http://localhost:5173';
        res.redirect(redirectUrl);
      } catch (err) {
        console.error('Moodle SSO Callback error:', err);
        res.status(500).send('An unexpected error occurred during Moodle SSO authentication.');
      }
    },
  };
}
