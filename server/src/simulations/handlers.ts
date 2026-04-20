import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import { createSimulationRepository } from './repository.js';
import { validateSubmission, getResourceLimits } from './validation.js';

/** Compute probability for each bitstring as count / shots, rounded to 4 decimal places. */
function computeProbabilities(
  counts: Record<string, number>,
  shots: number,
): Record<string, number> {
  const probabilities: Record<string, number> = {};
  for (const [bitstring, count] of Object.entries(counts)) {
    probabilities[bitstring] = shots > 0 ? parseFloat((count / shots).toFixed(4)) : 0;
  }
  return probabilities;
}

/**
 * Sort outcomes by probability descending, then bitstring ascending for determinism.
 * Returns an array of [bitstring, count] pairs in stable order.
 */
function sortedOutcomes(
  counts: Record<string, number>,
  probabilities: Record<string, number>,
): Array<[string, number]> {
  return Object.entries(counts).sort(([aKey], [bKey]) => {
    const probDiff = (probabilities[bKey] ?? 0) - (probabilities[aKey] ?? 0);
    if (probDiff !== 0) return probDiff;
    return aKey.localeCompare(bKey);
  });
}

/** Shape the public job response (omits qasmInput to avoid echoing untrusted input). */
function formatJobResponse(job: {
  id: string;
  provider: string;
  status: string;
  shots: number;
  backend: string;
  providerJobId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
}) {
  const base: Record<string, unknown> = {
    jobId: job.id,
    provider: job.provider,
    status: job.status,
    shots: job.shots,
    backend: job.backend,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    cancelledAt: job.cancelledAt,
  };

  // Include provider job ID for IBM jobs (useful for traceability)
  if (job.providerJobId) {
    base.providerJobId = job.providerJobId;
  }

  if (job.errorCode) {
    base.error = {
      errorCode: job.errorCode,
      message: job.errorMessageSafe ?? 'An unexpected error occurred.',
    };
  }

  return base;
}

export function createSimulationHandlers(pool: Db, onJobCreated?: () => void) {
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

        // Nudge the runner to pick up the new job immediately
        if (!wasPreExisting) onJobCreated?.();
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

        const probabilities = computeProbabilities(result.countsJson, job.shots);

        res.status(200).json({
          jobId: result.jobId,
          shots: job.shots,
          counts: result.countsJson,
          probabilities,
          metadata: result.metadataJson,
          createdAt: result.createdAt,
        });
      } catch (err) {
        console.error('Get job result error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /** GET /api/v1/simulations/jobs/:jobId/result/export — Download results as JSON or CSV. */
    async getJobResultExport(req: Request, res: Response): Promise<void> {
      try {
        const jobId = req.params.jobId as string;
        const userId = req.user!.id;
        const format = (req.query.format as string | undefined)?.toLowerCase() ?? 'json';

        if (format !== 'json' && format !== 'csv') {
          res.status(400).json({
            error: 'Invalid export format. Supported formats: json, csv.',
            errorCode: 'EXPORT_INVALID_FORMAT',
          });
          return;
        }

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
          res.status(400).json({
            error: 'Cannot export results for a failed job.',
            errorCode: 'EXPORT_JOB_FAILED',
          });
          return;
        }

        if (job.status !== 'completed') {
          res.status(400).json({
            error: `Cannot export results. Job is still ${job.status}.`,
            errorCode: 'EXPORT_JOB_NOT_COMPLETED',
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

        const counts = result.countsJson;

        if (!counts || Object.keys(counts).length === 0) {
          res.status(400).json({
            error: 'No measurement outcomes available to export.',
            errorCode: 'EXPORT_EMPTY_RESULTS',
          });
          return;
        }

        const probabilities = computeProbabilities(counts, job.shots);
        const sorted = sortedOutcomes(counts, probabilities);
        const exportedAt = new Date().toISOString();

        if (format === 'csv') {
          const lines: string[] = [
            `# jobId: ${job.id}`,
            `# shots: ${job.shots}`,
            `# exportedAt: ${exportedAt}`,
            'outcome,counts,probability',
          ];

          for (const [bitstring, count] of sorted) {
            lines.push(`${bitstring},${count},${(probabilities[bitstring] ?? 0).toFixed(4)}`);
          }

          const csv = lines.join('\n') + '\n';

          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="results-${job.id}.csv"`);
          res.status(200).send(csv);
          return;
        }

        // JSON export
        const sortedCounts: Record<string, number> = {};
        const sortedProbabilities: Record<string, number> = {};
        for (const [bitstring, count] of sorted) {
          sortedCounts[bitstring] = count;
          sortedProbabilities[bitstring] = probabilities[bitstring] ?? 0;
        }

        const payload = {
          jobId: job.id,
          shots: job.shots,
          counts: sortedCounts,
          probabilities: sortedProbabilities,
          exportedAt,
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="results-${job.id}.json"`);
        res.status(200).json(payload);
      } catch (err) {
        console.error('Export job result error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },
  };
}
