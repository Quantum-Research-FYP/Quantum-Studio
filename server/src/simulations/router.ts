import { Router } from 'express';
import type { Db } from 'mongodb';
import { requireAuth } from '../middleware/authenticate.js';
import { createSimulationHandlers } from './handlers.js';

export function createSimulationsRouter(pool: Db, onJobCreated?: () => void): Router {
  const router = Router();
  const handlers = createSimulationHandlers(pool, onJobCreated);

  // All simulation routes require authentication
  router.use(requireAuth);

  router.post('/jobs', handlers.submitJob);
  router.get('/jobs/:jobId', handlers.getJobStatus);
  router.get('/jobs/:jobId/result', handlers.getJobResult);
  router.get('/jobs/:jobId/result/export', handlers.getJobResultExport);

  router.post('/stepper', handlers.runStepper);
  router.post('/analyze', handlers.analyzePerformance);

  return router;
}
