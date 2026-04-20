/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { createIntegrationsHandlers } from './handlers.js';

export function createIntegrationsRouter(pool: any): Router {
  const router = Router();
  const handlers = createIntegrationsHandlers(pool);

  // All integration routes require authentication
  router.use(requireAuth);

  router.post('/settings', handlers.saveSettings);
  router.get('/settings', handlers.getSettings);
  router.delete('/settings', handlers.deleteSettings);

  return router;
}
