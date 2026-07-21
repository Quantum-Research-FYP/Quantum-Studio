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
    /** GET /api/auth/google */
    async googleAuth(req: Request, res: Response): Promise<void> {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        res.status(500).json({ error: 'Google SSO is not configured.' });
        return;
      }
      
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const redirectUri = `${appUrl}/api/auth/google/callback`;
      
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'email profile');
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      
      res.redirect(url.toString());
    },

    /** GET /api/auth/google/callback */
    async googleCallback(req: Request, res: Response): Promise<void> {
      const { code, error } = req.query;
      
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      
      if (error) {
        res.redirect(`${appUrl}/login?error=google_sso_failed`);
        return;
      }
      if (!code || typeof code !== 'string') {
        res.status(400).send('Invalid request');
        return;
      }
      
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = `${appUrl}/api/auth/google/callback`;
      
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId!,
            client_secret: clientSecret!,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange code');
        }
        
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        
        const userData = await userRes.json();
        if (!userRes.ok) {
          throw new Error(userData.error?.message || 'Failed to fetch user profile');
        }
        
        const email = normalizeEmail(userData.email);
        const googleId = userData.id;
        
        let user = await users.findOne({ email });
        const now = new Date();
        
        if (!user) {
          const userId = uuid();
          user = {
            _id: userId,
            email,
            passwordHash: null,
            googleUserId: googleId,
            firstname: userData.given_name || '',
            lastname: userData.family_name || '',
            lastLoginAt: now,
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          };
          await users.insertOne(user);
        } else {
          await users.updateOne(
            { _id: user._id },
            {
              $set: {
                lastLoginAt: now,
                googleUserId: googleId,
                updatedAt: now,
              },
            }
          );
        }
        
        await createSession(pool, user._id as string, req, res);
        res.redirect(appUrl);
      } catch (err) {
        console.error('Google SSO Callback error:', err);
        res.redirect(`${appUrl}/login?error=google_sso_error`);
      }
    },

    /** GET /api/auth/github */
    async githubAuth(req: Request, res: Response): Promise<void> {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        res.status(500).json({ error: 'GitHub SSO is not configured.' });
        return;
      }
      
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const redirectUri = `${appUrl}/api/auth/github/callback`;
      
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', 'user:email');
      
      res.redirect(url.toString());
    },

    /** GET /api/auth/github/callback */
    async githubCallback(req: Request, res: Response): Promise<void> {
      const { code, error } = req.query;
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      
      if (error) {
        res.redirect(`${appUrl}/login?error=github_sso_failed`);
        return;
      }
      if (!code || typeof code !== 'string') {
        res.status(400).send('Invalid request');
        return;
      }
      
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      
      try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
          }),
        });
        
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
          throw new Error(tokenData.error_description || tokenData.error);
        }
        
        const userRes = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json',
          },
        });
        const userData = await userRes.json();
        
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json',
          },
        });
        const emailsData = await emailsRes.json();
        
        const primaryEmailObj = emailsData.find((e: any) => e.primary) || emailsData[0];
        if (!primaryEmailObj || !primaryEmailObj.email) {
          throw new Error('No email found for GitHub user');
        }
        
        const email = normalizeEmail(primaryEmailObj.email);
        const githubId = String(userData.id);
        
        let user = await users.findOne({ email });
        const now = new Date();
        
        if (!user) {
          const userId = uuid();
          const nameParts = (userData.name || '').split(' ');
          const firstname = nameParts[0] || '';
          const lastname = nameParts.slice(1).join(' ') || '';
          
          user = {
            _id: userId,
            email,
            passwordHash: null,
            githubUserId: githubId,
            firstname,
            lastname,
            lastLoginAt: now,
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          };
          await users.insertOne(user);
        } else {
          await users.updateOne(
            { _id: user._id },
            {
              $set: {
                lastLoginAt: now,
                githubUserId: githubId,
                updatedAt: now,
              },
            }
          );
        }
        
        await createSession(pool, user._id as string, req, res);
        res.redirect(appUrl);
      } catch (err) {
        console.error('GitHub SSO Callback error:', err);
        res.redirect(`${appUrl}/login?error=github_sso_error`);
      }
    },
  };
}
