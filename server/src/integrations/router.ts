import { Router } from 'express';
import type pg from 'pg';
import { requireAuth } from '../middleware/authenticate.js';
import { createIntegrationsHandlers } from './handlers.js';

export function createIntegrationsRouter(pool: pg.Pool): Router {
  const router = Router();
  const handlers = createIntegrationsHandlers(pool);

  // All integration routes require authentication
  router.use(requireAuth);

  router.post('/settings', handlers.saveSettings);
  router.get('/settings', handlers.getSettings);
  router.delete('/settings', handlers.deleteSettings);

  return router;
}
