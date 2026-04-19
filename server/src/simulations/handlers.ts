import type { Request, Response } from 'express';
import type pg from 'pg';
import { createSimulationRepository } from './repository.js';
import { validateSubmission, getResourceLimits } from './validation.js';

/** Shape the public job response (omits qasmInput to avoid echoing untrusted input). */
function formatJobResponse(job: {
  id: string;
  status: string;
  shots: number;
  backend: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
}) {
  const base = {
    jobId: job.id,
    status: job.status,
    shots: job.shots,
    backend: job.backend,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };

  if (job.errorCode) {
    return {
      ...base,
      error: {
        errorCode: job.errorCode,
        message: job.errorMessageSafe ?? 'An unexpected error occurred.',
      },
    };
  }

  return base;
}

export function createSimulationHandlers(pool: pg.Pool) {
  const repo = createSimulationRepository(pool);

  return {
    /** POST /api/v1/simulations/jobs — Submit a new simulation job. */
    async submitJob(req: Request, res: Response): Promise<void> {
      try {
        const { qasm, shots, idempotencyKey } = req.body ?? {};
        const userId = req.user!.id;

        // Validate input against resource limits
        const limits = getResourceLimits();
        const errors = validateSubmission(qasm, shots, limits);

        if (errors.length > 0) {
          res.status(400).json({
            error: errors[0].message,
            errorCode: errors[0].errorCode,
            details: errors,
          });
          return;
        }

        // Validate idempotency key format if provided
        if (
          idempotencyKey !== undefined &&
          (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0)
        ) {
          res.status(400).json({
            error: 'Idempotency key must be a non-empty string.',
            errorCode: 'VALIDATION_IDEMPOTENCY_KEY',
          });
          return;
        }

        const job = await repo.createJob({
          userId,
          qasmInput: qasm,
          shots,
          limitsSnapshot: { ...limits },
          idempotencyKey: idempotencyKey?.trim(),
        });

        // Idempotency hit: if the job is past 'queued', it predates this request
        const wasPreExisting =
          idempotencyKey && job.idempotencyKey === idempotencyKey.trim() && job.status !== 'queued';

        res.status(wasPreExisting ? 200 : 201).json(formatJobResponse(job));
      } catch (err) {
        console.error('Submit job error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** GET /api/v1/simulations/jobs/:jobId — Get job status. */
    async getJobStatus(req: Request, res: Response): Promise<void> {
      try {
        const jobId = req.params.jobId as string;
        const userId = req.user!.id;

        const job = await repo.getJob(jobId);

        if (!job) {
          res.status(404).json({ error: 'Job not found.' });
          return;
        }

        // Users can only view their own jobs
        if (job.createdByUserId !== userId) {
          res.status(404).json({ error: 'Job not found.' });
          return;
        }

        res.status(200).json(formatJobResponse(job));
      } catch (err) {
        console.error('Get job status error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** GET /api/v1/simulations/jobs/:jobId/result — Get job results. */
    async getJobResult(req: Request, res: Response): Promise<void> {
      try {
        const jobId = req.params.jobId as string;
        const userId = req.user!.id;

        const job = await repo.getJob(jobId);

        if (!job) {
          res.status(404).json({ error: 'Job not found.' });
          return;
        }

        if (job.createdByUserId !== userId) {
          res.status(404).json({ error: 'Job not found.' });
          return;
        }

        if (job.status === 'failed') {
          res.status(200).json({
            jobId: job.id,
            status: 'failed',
            error: {
              errorCode: job.errorCode,
              message: job.errorMessageSafe ?? 'An unexpected error occurred.',
            },
          });
          return;
        }

        if (job.status !== 'completed') {
          res.status(404).json({
            error: 'Results are not yet available. Job is still ' + job.status + '.',
          });
          return;
        }

        const result = await repo.getResult(jobId);

        if (!result) {
          res.status(404).json({
            error: 'Results have expired or are no longer available.',
          });
          return;
        }

        res.status(200).json({
          jobId: result.jobId,
          counts: result.countsJson,
          metadata: result.metadataJson,
          createdAt: result.createdAt,
        });
      } catch (err) {
        console.error('Get job result error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },
  };
}
