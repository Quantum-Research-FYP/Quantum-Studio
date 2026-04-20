import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'node:crypto';
import { createSimulationRepository } from '../simulations/repository.js';
import { createIntegrationsRepository } from '../integrations/repository.js';
import { createAuditRepository } from './audit.js';
import { createIbmClient } from './ibm-client.js';
import { checkPollRateLimit } from './poll-rate-limiter.js';
import { normalizeIbmStatus, isValidTransition } from './types.js';
import type { ExecutionJobStatus } from './types.js';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROVIDER = 'ibm_quantum';

/** Minimum interval between provider status refreshes (ms). Scales by status. */
const REFRESH_BACKOFF: Record<string, number> = {
  submitted: 10000, // 10s
  queued: 30000, // 30s
  running: 5000, // 5s
};
const DEFAULT_REFRESH_BACKOFF_MS = 15000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIbmQuantumEnabled(): boolean {
  return process.env.ENABLE_IBM_QUANTUM === 'true';
}

function featureDisabledResponse(res: Response): void {
  res.status(503).json({
    error: 'IBM Quantum integration is not enabled.',
    errorCode: 'IBM_QUANTUM_DISABLED',
    suggestion: 'Use the simulator provider instead.',
  });
}

function ibmErrorResponse(
  res: Response,
  statusCode: number,
  errorCode: string,
  message: string,
): void {
  res.status(statusCode).json({
    error: message,
    errorCode,
    suggestion: 'Consider using the simulator as a fallback.',
  });
}

/** Check if enough time has passed since last update to warrant a provider refresh. */
function shouldRefreshFromProvider(job: { status: string; updatedAt: string }): boolean {
  const backoffMs = REFRESH_BACKOFF[job.status] ?? DEFAULT_REFRESH_BACKOFF_MS;
  const lastUpdate = new Date(job.updatedAt).getTime();
  return Date.now() - lastUpdate > backoffMs;
}

// ---------------------------------------------------------------------------
// Handler Factory
// ---------------------------------------------------------------------------

export function createExecutionHandlers(pool: Db, onSimulatorJobCreated?: () => void) {
  const jobRepo = createSimulationRepository(pool);
  const integrationsRepo = createIntegrationsRepository(pool);
  const audit = createAuditRepository(pool);
  const ibm = createIbmClient();

  /** Retrieve and validate user's IBM token. Returns null and sends error if unavailable. */
  async function getUserToken(req: Request, res: Response): Promise<string | null> {
    const userId = req.user!.id;
    const token = await integrationsRepo.getDecryptedToken(userId, PROVIDER);

    if (!token) {
      res.status(400).json({
        error: 'IBM Quantum credentials are not configured. Please save your token in Settings.',
        errorCode: 'CREDENTIALS_MISSING',
        suggestion: 'Go to Settings > Integrations > IBM Quantum to configure your API token.',
      });
      return null;
    }
    return token;
  }

  return {
    /**
     * GET /api/execution/providers
     * List available execution providers and their capabilities.
     */
    async getProviders(_req: Request, res: Response): Promise<void> {
      const providers = [
        { id: 'simulator', name: 'Simulator', available: true },
        { id: 'ibm_quantum', name: 'IBM Quantum', available: isIbmQuantumEnabled() },
      ];
      res.status(200).json({ providers });
    },

    /**
     * GET /api/execution/ibm/backends
     * List available IBM hardware backends for the authenticated user.
     */
    async listBackends(req: Request, res: Response): Promise<void> {
      if (!isIbmQuantumEnabled()) {
        featureDisabledResponse(res);
        return;
      }

      const token = await getUserToken(req, res);
      if (!token) return;

      const result = await ibm.listBackends(token);

      if (!result.ok) {
        const statusCode = result.error.errorCode === 'INVALID_TOKEN' ? 401 : 502;
        ibmErrorResponse(res, statusCode, result.error.errorCode, result.error.message);
        return;
      }

      res.status(200).json({ backends: result.data });
    },

    /**
     * POST /api/execution/jobs
     * Submit an execution job (simulator or IBM Quantum).
     */
    async submitJob(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const { provider, backend, qasm, shots, idempotencyKey } = req.body ?? {};

      // Validate common fields
      if (!qasm || typeof qasm !== 'string' || qasm.trim().length === 0) {
        res.status(400).json({ error: 'A non-empty qasm string is required.', errorCode: 'INVALID_INPUT' });
        return;
      }
      if (!shots || typeof shots !== 'number' || shots < 1 || shots > 100000) {
        res.status(400).json({ error: 'Shots must be between 1 and 100,000.', errorCode: 'INVALID_INPUT' });
        return;
      }

      // Simulator path: delegate to existing simulation job creation
      if (!provider || provider === 'simulator') {
        const job = await jobRepo.createJob({
          userId,
          qasmInput: qasm,
          shots,
          backend: backend || 'aer_simulator',
          provider: 'simulator',
          limitsSnapshot: {},
          idempotencyKey,
        });

        onSimulatorJobCreated?.();

        res.status(201).json({
          jobId: job.id,
          provider: job.provider,
          status: job.status,
          backend: job.backend,
          shots: job.shots,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        });
        return;
      }

      // IBM Quantum path
      if (provider !== 'ibm_quantum') {
        res.status(400).json({ error: `Unsupported provider: ${provider}`, errorCode: 'INVALID_PROVIDER' });
        return;
      }

      if (!isIbmQuantumEnabled()) {
        featureDisabledResponse(res);
        return;
      }

      if (!backend || typeof backend !== 'string') {
        res.status(400).json({ error: 'A backend target is required for IBM Quantum jobs.', errorCode: 'INVALID_INPUT' });
        return;
      }

      const token = await getUserToken(req, res);
      if (!token) return;

      // Submit to IBM
      const ibmResult = await ibm.submitJob(token, backend, qasm, shots);

      if (!ibmResult.ok) {
        const statusCode =
          ibmResult.error.errorCode === 'INVALID_TOKEN' ? 401 :
          ibmResult.error.errorCode === 'PROVIDER_RATE_LIMITED' ? 429 : 502;
        ibmErrorResponse(res, statusCode, ibmResult.error.errorCode, ibmResult.error.message);
        return;
      }

      // Create internal job record with mapping to provider job ID
      const job = await jobRepo.createJob({
        userId,
        qasmInput: qasm,
        shots,
        backend,
        provider: 'ibm_quantum',
        providerJobId: ibmResult.data.providerJobId,
        limitsSnapshot: {},
        idempotencyKey,
      });

      const correlationId = crypto.randomUUID();

      // Audit the submission
      await audit.log({
        actorUserId: userId,
        action: 'job.submit',
        entityType: 'execution_job',
        entityId: job.id,
        correlationId,
        metadata: {
          provider: 'ibm_quantum',
          backend,
          providerJobId: ibmResult.data.providerJobId,
        },
      });

      res.status(201).json({
        jobId: job.id,
        provider: job.provider,
        providerJobId: job.providerJobId,
        status: job.status,
        backend: job.backend,
        shots: job.shots,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    },

    /**
     * GET /api/execution/jobs/:jobId
     * Get job status with provider state refresh (cached with backoff).
     */
    async getJobStatus(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const jobId = req.params.jobId as string;

      const job = await jobRepo.getJob(jobId);

      if (!job || job.createdByUserId !== userId) {
        res.status(404).json({ error: 'Job not found.', errorCode: 'NOT_FOUND' });
        return;
      }

      // For IBM jobs in non-terminal states, refresh from provider if enough time passed
      if (
        job.provider === 'ibm_quantum' &&
        job.providerJobId &&
        !['completed', 'failed', 'cancelled'].includes(job.status)
      ) {
        // Rate limit polling
        const rateCheck = checkPollRateLimit(userId);
        if (!rateCheck.allowed) {
          res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
          res.status(429).json({
            error: 'Polling rate limit exceeded. Please wait before checking again.',
            errorCode: 'RATE_LIMITED',
            retryAfterSeconds: rateCheck.retryAfterSeconds,
          });
          return;
        }

        if (shouldRefreshFromProvider(job)) {
          await refreshJobFromProvider(userId, job.id, job.providerJobId, job.status as ExecutionJobStatus);
        }
      }

      // Re-fetch after potential refresh
      const updatedJob = await jobRepo.getJob(jobId);
      if (!updatedJob) {
        res.status(404).json({ error: 'Job not found.', errorCode: 'NOT_FOUND' });
        return;
      }

      const response: Record<string, unknown> = {
        jobId: updatedJob.id,
        provider: updatedJob.provider,
        status: updatedJob.status,
        backend: updatedJob.backend,
        shots: updatedJob.shots,
        createdAt: updatedJob.createdAt,
        updatedAt: updatedJob.updatedAt,
        startedAt: updatedJob.startedAt,
        completedAt: updatedJob.completedAt,
        cancelledAt: updatedJob.cancelledAt,
      };

      if (updatedJob.providerJobId) {
        response.providerJobId = updatedJob.providerJobId;
      }

      if (updatedJob.errorCode) {
        response.error = {
          errorCode: updatedJob.errorCode,
          message: updatedJob.errorMessageSafe ?? 'An unexpected error occurred.',
        };
      }

      res.status(200).json(response);
    },

    /**
     * POST /api/execution/jobs/:jobId/cancel
     * Attempt to cancel a job.
     */
    async cancelJob(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const jobId = req.params.jobId as string;
      const correlationId = crypto.randomUUID();

      const job = await jobRepo.getJob(jobId);

      if (!job || job.createdByUserId !== userId) {
        res.status(404).json({ error: 'Job not found.', errorCode: 'NOT_FOUND' });
        return;
      }

      // Check if job is in a cancellable state
      if (['completed', 'failed', 'cancelled'].includes(job.status)) {
        res.status(409).json({
          error: `Job cannot be cancelled (current status: ${job.status}).`,
          errorCode: 'NOT_CANCELLABLE',
        });
        return;
      }

      // For IBM jobs, attempt provider-side cancellation
      if (job.provider === 'ibm_quantum' && job.providerJobId) {
        const token = await integrationsRepo.getDecryptedToken(userId, PROVIDER);

        if (token) {
          const cancelResult = await ibm.cancelJob(token, job.providerJobId);

          if (!cancelResult.ok) {
            // Provider cancel failed — report but don't block
            ibmErrorResponse(res, 502, cancelResult.error.errorCode,
              `Cancellation request failed: ${cancelResult.error.message}. Job remains in current state.`);
            return;
          }

          if (!cancelResult.data.cancelled) {
            res.status(409).json({
              error: 'Provider could not cancel the job (it may have already completed).',
              errorCode: 'CANCEL_REJECTED',
            });
            return;
          }
        }
      }

      // Transition internal state to cancelled
      const updated = await jobRepo.transitionStatus(jobId, 'cancelled');

      if (!updated) {
        // Race condition: status changed between check and update
        res.status(409).json({
          error: 'Job status changed before cancellation could be applied.',
          errorCode: 'CANCEL_CONFLICT',
        });
        return;
      }

      // Audit
      await audit.log({
        actorUserId: userId,
        action: 'job.cancel',
        entityType: 'execution_job',
        entityId: jobId,
        correlationId,
        metadata: { provider: job.provider, previousStatus: job.status },
      });

      res.status(200).json({
        jobId: updated.id,
        provider: updated.provider,
        status: updated.status,
        cancelledAt: updated.cancelledAt,
      });
    },
  };

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  async function refreshJobFromProvider(
    userId: string,
    jobId: string,
    providerJobId: string,
    currentStatus: ExecutionJobStatus,
  ): Promise<void> {
    const token = await integrationsRepo.getDecryptedToken(userId, PROVIDER);
    if (!token) return; // Can't refresh without credentials

    const result = await ibm.getJobStatus(token, providerJobId);
    if (!result.ok) return; // Graceful degradation: keep current state

    const newStatus = normalizeIbmStatus(result.data.status);

    // Only apply valid forward transitions
    if (newStatus === currentStatus || !isValidTransition(currentStatus, newStatus)) {
      // Still update the timestamp to reset backoff clock
      const jobsCol = pool.collection<AppDocument>(COLLECTIONS.SIMULATION_JOBS);
      await jobsCol.updateOne(
        { _id: jobId },
        { $set: { updatedAt: new Date(), statusDetail: result.data.status } },
      );
      return;
    }

    // Transition with extra metadata
    const extra: {
      statusDetail?: string;
      errorCode?: string;
      errorMessageSafe?: string;
    } = { statusDetail: result.data.status };

    if (newStatus === 'failed' && result.data.errorMessage) {
      extra.errorCode = 'IBM_EXECUTION_ERROR';
      extra.errorMessageSafe = result.data.errorMessage.slice(0, 300);
    }

    await jobRepo.transitionStatus(jobId, newStatus, extra);

    // If job completed, store results
    if (newStatus === 'completed' && result.data.counts) {
      await jobRepo.storeResult({
        jobId,
        counts: result.data.counts,
        metadata: {
          ...result.data.metadata,
          provider: 'ibm_quantum',
          providerJobId,
        },
      });
    }
  }
}
