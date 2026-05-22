import { Router } from 'express';
import type { Db } from 'mongodb';
import { requireAuth } from '../middleware/authenticate.js';
import { createExecutionHandlers } from './handlers.js';

export function createExecutionRouter(
  pool: Db,
  onSimulatorJobCreated?: () => void,
): Router {
  const router = Router();
  const handlers = createExecutionHandlers(pool, onSimulatorJobCreated);

  // All execution routes require authentication
  router.use(requireAuth);

  // Provider capabilities
  router.get('/providers', handlers.getProviders);

  // IBM backend listing
  router.get('/ibm/backends', handlers.listBackends);

  // Job lifecycle
  router.get('/jobs', handlers.listJobs);
  router.post('/jobs', handlers.submitJob);
  router.get('/jobs/:jobId', handlers.getJobStatus);
  router.post('/jobs/:jobId/cancel', handlers.cancelJob);

  return router;
}
