/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { createSharingHandlers } from './handlers.js';

/**
 * Public shared-viewer router.
 * Mounted at /api/shared — no authentication required.
 */
export function createSharedRouter(pool: any): Router {
  const router = Router();
  const handlers = createSharingHandlers(pool);

  router.get('/experiments/:id', handlers.getSharedExperiment);

  return router;
}

/**
 * Owner-only share-management routes.
 * Mounted under /api/experiments — requires authentication.
 */
export function createShareManagementRouter(pool: any): Router {
  const router = Router();
  const handlers = createSharingHandlers(pool);

  router.use(requireAuth);

  router.patch('/:id/visibility', handlers.updateVisibility);
  router.get('/:id/share-link', handlers.getShareLink);
  router.post('/:id/share-token/rotate', handlers.rotateToken);
  router.delete('/:id/share-token', handlers.revokeToken);

  return router;
}
