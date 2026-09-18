import { Router } from 'express';
import type { Db } from 'mongodb';
import { createAuthHandlers } from './handlers.js';

export function createAuthRouter(pool: Db): Router {
  const router = Router();
  const handlers = createAuthHandlers(pool);

  router.post('/signup', handlers.signup);
  router.post('/login', handlers.login);
  router.post('/logout', handlers.logout);
  router.get('/me', handlers.me);
  router.patch('/profile', handlers.updateProfile);
  router.post('/password', handlers.changePassword);
  router.delete('/account', handlers.deleteAccount);
  router.post('/moodle/callback', handlers.moodleCallback);
  router.get('/google', handlers.googleAuth);
  router.get('/google/callback', handlers.googleCallback);
  router.get('/github', handlers.githubAuth);
  router.get('/github/callback', handlers.githubCallback);
  // Cross-domain SSO handoff: swap a one-time token for a real session cookie
  router.get('/session/exchange', handlers.sessionExchange);
  return router;
}
