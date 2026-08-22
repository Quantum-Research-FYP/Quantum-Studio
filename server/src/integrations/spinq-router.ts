import { Router } from 'express';
import type { Db } from 'mongodb';
import { requireAuth } from '../middleware/authenticate.js';
import { createSpinqHandlers } from './spinq-handlers.js';

export function createSpinqRouter(pool: Db): Router {
  const router = Router();
  const handlers = createSpinqHandlers(pool);

  router.use(requireAuth);

  router.post('/settings', handlers.saveSettings);
  router.get('/settings', handlers.getSettings);

  return router;
}
