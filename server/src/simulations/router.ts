import { Router } from 'express';
import type pg from 'pg';
import { requireAuth } from '../middleware/authenticate.js';
import { createSimulationHandlers } from './handlers.js';

export function createSimulationsRouter(pool: pg.Pool, onJobCreated?: () => void): Router {
  const router = Router();
  const handlers = createSimulationHandlers(pool, onJobCreated);

  // All simulation routes require authentication
  router.use(requireAuth);

  router.post('/jobs', handlers.submitJob);
  router.get('/jobs/:jobId', handlers.getJobStatus);
  router.get('/jobs/:jobId/result', handlers.getJobResult);

  return router;
}
