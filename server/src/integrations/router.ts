import { Router } from 'express';
import type { Db } from 'mongodb';
import { requireAuth } from '../middleware/authenticate.js';
import { createIntegrationsHandlers } from './handlers.js';

export function createIntegrationsRouter(pool: Db): Router {
  const router = Router();
  const handlers = createIntegrationsHandlers(pool);

  // All integration routes require authentication
  router.use(requireAuth);

  router.post('/settings', handlers.saveSettings);
  router.get('/settings', handlers.getSettings);
  router.delete('/settings', handlers.deleteSettings);

  return router;
}
