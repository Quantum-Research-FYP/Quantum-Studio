/**
 * GitHub integration Express router.
 *
 * Mounts all GitHub-related endpoints under /api/integrations/github.
 * The /connect and /callback routes are partially unauthenticated (OAuth flow),
 * while all other routes require authentication.
 */

import { Router } from 'express';
import type { Db } from 'mongodb';
import { requireAuth } from '../middleware/authenticate.js';
import { createGitHubHandlers } from './github-handlers.js';

export function createGitHubRouter(pool: Db): Router {
  const router = Router();
  const handlers = createGitHubHandlers(pool);

  // OAuth flow — /connect requires auth (we need userId), /callback is unauthenticated
  // (GitHub redirects back without our cookie, so we pass userId in the state param)
  router.get('/connect', requireAuth, handlers.connect);
  router.get('/callback', handlers.callback);

  // All remaining routes require authentication
  router.use(requireAuth);

  router.get('/status', handlers.status);
  router.post('/disconnect', handlers.disconnect);
  router.get('/repos', handlers.listRepos);
  router.post('/push', handlers.push);
  router.post('/import', handlers.importFile);

  return router;
}
