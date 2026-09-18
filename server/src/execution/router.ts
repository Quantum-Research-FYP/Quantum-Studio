import { Router } from 'express';
import type { Db } from 'mongodb';
import { requireAuth } from '../middleware/authenticate.js';
import { createExecutionHandlers } from './handlers.js';

export function createExecutionRouter(pool: Db, onSimulatorJobCreated?: () => void): Router {
  const router = Router();
  const handlers = createExecutionHandlers(pool, onSimulatorJobCreated);

  // Simulator discovery, submission, and polling are available to guests.
  // Handlers enforce that anonymous submissions can only use the simulator.
  router.get('/providers', handlers.getProviders);
  router.post('/jobs', handlers.submitJob);
  router.get('/jobs/:jobId', handlers.getJobStatus);

  // Account history, hardware access, and cancellation remain login-only.
  router.get('/ibm/backends', requireAuth, handlers.listBackends);
  router.get('/jobs', requireAuth, handlers.listJobs);
  router.post('/jobs/:jobId/cancel', requireAuth, handlers.cancelJob);

  return router;
}
