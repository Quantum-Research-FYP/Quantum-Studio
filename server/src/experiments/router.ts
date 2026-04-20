import { Router } from 'express';
import type { Db } from 'mongodb';
import express from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { createExperimentHandlers } from './handlers.js';

export function createExperimentsRouter(pool: Db): Router {
  const router = Router();
  const handlers = createExperimentHandlers(pool);

  // All experiment routes require authentication
  router.use(requireAuth);

  // Enforce payload size limit for experiment bodies (256KB)
  router.use(express.json({ limit: '256kb' }));

  router.post('/', handlers.createExperiment);
  router.get('/', handlers.listExperiments);
  router.get('/:id', handlers.getExperiment);
  router.get('/:id/raw', handlers.exportExperimentRaw);
  router.put('/:id', handlers.updateExperiment);
  router.patch('/:id', handlers.renameExperiment);
  router.delete('/:id', handlers.deleteExperiment);

  return router;
}
