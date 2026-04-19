import type pg from 'pg';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface SimulationJob {
  id: string;
  createdByUserId: string;
  status: JobStatus;
  shots: number;
  qasmInput: string;
  backend: string;
  limitsSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
  requestHash: string | null;
  idempotencyKey: string | null;
}

export interface SimulationJobResult {
  jobId: string;
  countsJson: Record<string, number>;
  metadataJson: Record<string, unknown>;
  rawResultJson: unknown | null;
  createdAt: string;
  retentionUntil: string;
}

export interface CreateJobInput {
  userId: string;
  qasmInput: string;
  shots: number;
  backend?: string;
  limitsSnapshot: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface StoreResultInput {
  jobId: string;
  counts: Record<string, number>;
  metadata: Record<string, unknown>;
  rawResult?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute a SHA-256 hash of (userId + qasm + shots) for dedup / lookup. */
export function computeRequestHash(userId: string, qasm: string, shots: number): string {
  return crypto.createHash('sha256').update(`${userId}:${qasm}:${shots}`).digest('hex');
}

/** Map a snake_case DB row to a camelCase SimulationJob. */
function rowToJob(row: Record<string, unknown>): SimulationJob {
  return {
    id: row.id as string,
    createdByUserId: row.created_by_user_id as string,
    status: row.status as JobStatus,
    shots: row.shots as number,
    qasmInput: row.qasm_input as string,
    backend: row.backend as string,
    limitsSnapshot: row.limits_snapshot as Record<string, unknown>,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    errorCode: (row.error_code as string) ?? null,
    errorMessageSafe: (row.error_message_safe as string) ?? null,
    requestHash: (row.request_hash as string) ?? null,
    idempotencyKey: (row.idempotency_key as string) ?? null,
  };
}

/** Map a snake_case DB row to a camelCase SimulationJobResult. */
function rowToResult(row: Record<string, unknown>): SimulationJobResult {
  return {
    jobId: row.job_id as string,
    countsJson: row.counts_json as Record<string, number>,
    metadataJson: row.metadata_json as Record<string, unknown>,
    rawResultJson: (row.raw_result_json as unknown) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    retentionUntil: (row.retention_until as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Valid status transitions (monotonic)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, JobStatus[]> = {
  queued: ['running', 'failed'],
  running: ['completed', 'failed'],
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createSimulationRepository(pool: pg.Pool) {
  return {
    /**
     * Create a new simulation job. If an idempotency key is provided and a job
     * with that key already exists for this user, the existing job is returned
     * instead of creating a duplicate.
     */
    async createJob(input: CreateJobInput): Promise<SimulationJob> {
      const {
        userId,
        qasmInput,
        shots,
        backend = 'aer_simulator',
        limitsSnapshot,
        idempotencyKey,
      } = input;

      const requestHash = computeRequestHash(userId, qasmInput, shots);

      // Check idempotency: return existing job if key matches
      if (idempotencyKey) {
        const existing = await pool.query(
          `SELECT * FROM simulation_jobs
           WHERE created_by_user_id = $1 AND idempotency_key = $2`,
          [userId, idempotencyKey],
        );
        if (existing.rows.length > 0) {
          return rowToJob(existing.rows[0]);
        }
      }

      const result = await pool.query(
        `INSERT INTO simulation_jobs
           (created_by_user_id, shots, qasm_input, backend, limits_snapshot, request_hash, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          userId,
          shots,
          qasmInput,
          backend,
          JSON.stringify(limitsSnapshot),
          requestHash,
          idempotencyKey ?? null,
        ],
      );

      return rowToJob(result.rows[0]);
    },

    /**
     * Fetch a job by ID. Returns null if not found.
     */
    async getJob(jobId: string): Promise<SimulationJob | null> {
      const result = await pool.query('SELECT * FROM simulation_jobs WHERE id = $1', [jobId]);
      return result.rows.length > 0 ? rowToJob(result.rows[0]) : null;
    },

    /**
     * Transition a job's status atomically and monotonically.
     * Only succeeds if the current status is a valid predecessor of the new status.
     * Returns the updated job, or null if the transition was invalid / job not found.
     */
    async transitionStatus(
      jobId: string,
      newStatus: JobStatus,
      extra?: {
        errorCode?: string;
        errorMessageSafe?: string;
      },
    ): Promise<SimulationJob | null> {
      // Determine which previous statuses can transition to newStatus
      const allowedFrom = Object.entries(VALID_TRANSITIONS)
        .filter(([, targets]) => targets.includes(newStatus))
        .map(([from]) => from);

      if (allowedFrom.length === 0) {
        return null; // newStatus is not a valid target (e.g. 'queued')
      }

      // Build the SET clause dynamically
      const setClauses = ['status = $2', 'updated_at = now()'];
      const params: unknown[] = [jobId, newStatus];
      let paramIdx = 3;

      if (newStatus === 'running') {
        setClauses.push(`started_at = COALESCE(started_at, now())`);
      }

      if (newStatus === 'completed' || newStatus === 'failed') {
        setClauses.push(`completed_at = COALESCE(completed_at, now())`);
      }

      if (extra?.errorCode !== undefined) {
        setClauses.push(`error_code = $${paramIdx}`);
        params.push(extra.errorCode);
        paramIdx++;
      }

      if (extra?.errorMessageSafe !== undefined) {
        setClauses.push(`error_message_safe = $${paramIdx}`);
        params.push(extra.errorMessageSafe);
        paramIdx++;
      }

      // Build the WHERE clause for allowed previous statuses
      const statusPlaceholders = allowedFrom.map((_, i) => `$${paramIdx + i}`);
      params.push(...allowedFrom);

      const result = await pool.query(
        `UPDATE simulation_jobs
         SET ${setClauses.join(', ')}
         WHERE id = $1 AND status IN (${statusPlaceholders.join(', ')})
         RETURNING *`,
        params,
      );

      return result.rows.length > 0 ? rowToJob(result.rows[0]) : null;
    },

    /**
     * Store structured results for a completed job.
     */
    async storeResult(input: StoreResultInput): Promise<SimulationJobResult> {
      const result = await pool.query(
        `INSERT INTO simulation_job_results (job_id, counts_json, metadata_json, raw_result_json)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          input.jobId,
          JSON.stringify(input.counts),
          JSON.stringify(input.metadata),
          input.rawResult ? JSON.stringify(input.rawResult) : null,
        ],
      );

      return rowToResult(result.rows[0]);
    },

    /**
     * Fetch results for a job, respecting the retention window.
     * Returns null if not found or past retention.
     */
    async getResult(jobId: string): Promise<SimulationJobResult | null> {
      const result = await pool.query(
        `SELECT * FROM simulation_job_results
         WHERE job_id = $1 AND retention_until > now()`,
        [jobId],
      );
      return result.rows.length > 0 ? rowToResult(result.rows[0]) : null;
    },

    /**
     * Fetch all jobs for a user, ordered by most recent first.
     */
    async getJobsByUser(userId: string, limit = 50): Promise<SimulationJob[]> {
      const result = await pool.query(
        `SELECT * FROM simulation_jobs
         WHERE created_by_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      return result.rows.map(rowToJob);
    },

    /**
     * Find the next queued job (FIFO) and atomically transition it to 'running'.
     * Returns the job if one was dequeued, null if the queue is empty.
     */
    async dequeueNextJob(): Promise<SimulationJob | null> {
      const result = await pool.query(
        `UPDATE simulation_jobs
         SET status = 'running', started_at = now(), updated_at = now()
         WHERE id = (
           SELECT id FROM simulation_jobs
           WHERE status = 'queued'
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
      );
      return result.rows.length > 0 ? rowToJob(result.rows[0]) : null;
    },

    /**
     * Delete expired results past their retention window.
     * Returns the number of rows deleted.
     */
    async purgeExpiredResults(): Promise<number> {
      const result = await pool.query(
        `DELETE FROM simulation_job_results WHERE retention_until <= now()`,
      );
      return result.rowCount ?? 0;
    },
  };
}
