import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import { v4 as uuid } from 'uuid';
import type { ExecutionProvider, ExecutionJobStatus } from '../execution/types.js';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = ExecutionJobStatus;

export type CodeType = 'qasm' | 'python';

export interface SimulationJob {
  id: string;
  createdByUserId: string;
  provider: ExecutionProvider;
  status: JobStatus;
  shots: number;
  qasmInput: string;
  codeType: CodeType;
  backend: string;
  providerJobId: string | null;
  statusDetail: string | null;
  limitsSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
  requestHash: string | null;
  idempotencyKey: string | null;
  noiseConfig?: Record<string, any>;
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
  codeType?: CodeType;
  shots: number;
  backend?: string;
  provider?: ExecutionProvider;
  providerJobId?: string;
  limitsSnapshot: Record<string, unknown>;
  idempotencyKey?: string;
  noiseConfig?: Record<string, any>;
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

/** Map a MongoDB document to a camelCase SimulationJob. */
function docToJob(doc: Record<string, unknown>): SimulationJob {
  return {
    id: doc._id as string,
    createdByUserId: doc.userId as string,
    provider: (doc.provider as ExecutionProvider) ?? 'simulator',
    status: doc.status as JobStatus,
    shots: doc.shots as number,
    qasmInput: doc.qasmInput as string,
    codeType: (doc.codeType as CodeType) ?? 'qasm',
    backend: doc.backend as string,
    providerJobId: (doc.providerJobId as string) ?? null,
    statusDetail: (doc.statusDetail as string) ?? null,
    limitsSnapshot: doc.limitsSnapshot as Record<string, unknown>,
    createdAt: (doc.createdAt as Date).toISOString(),
    updatedAt: (doc.updatedAt as Date).toISOString(),
    startedAt: doc.startedAt ? (doc.startedAt as Date).toISOString() : null,
    completedAt: doc.completedAt ? (doc.completedAt as Date).toISOString() : null,
    cancelledAt: doc.cancelledAt ? (doc.cancelledAt as Date).toISOString() : null,
    errorCode: (doc.errorCode as string) ?? null,
    errorMessageSafe: (doc.errorMessageSafe as string) ?? null,
    requestHash: (doc.requestHash as string) ?? null,
    idempotencyKey: (doc.idempotencyKey as string) ?? null,
    noiseConfig: doc.noiseConfig as Record<string, any> | undefined,
  };
}

/** Map a MongoDB document to a camelCase SimulationJobResult. */
function docToResult(doc: Record<string, unknown>): SimulationJobResult {
  return {
    jobId: doc.jobId as string,
    countsJson: doc.countsJson as Record<string, number>,
    metadataJson: doc.metadataJson as Record<string, unknown>,
    rawResultJson: (doc.rawResultJson as unknown) ?? null,
    createdAt: (doc.createdAt as Date).toISOString(),
    retentionUntil: (doc.retentionUntil as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Valid status transitions (monotonic)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, JobStatus[]> = {
  submitted: ['queued', 'running', 'completed', 'failed', 'cancelled'],
  queued: ['running', 'completed', 'failed', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

const DEFAULT_RETENTION_DAYS = 90;

export function createSimulationRepository(pool: Db) {
  const jobs = pool.collection<AppDocument>(COLLECTIONS.SIMULATION_JOBS);
  const results = pool.collection<AppDocument>(COLLECTIONS.SIMULATION_JOB_RESULTS);

  return {
    async createJob(input: CreateJobInput): Promise<SimulationJob> {
      const {
        userId,
        qasmInput,
        codeType = 'qasm',
        shots,
        backend = 'aer_simulator',
        provider = 'simulator',
        providerJobId,
        limitsSnapshot,
        idempotencyKey,
        noiseConfig,
      } = input;

      const requestHash = computeRequestHash(userId, qasmInput, shots);

      // Check idempotency: return existing job if key matches
      if (idempotencyKey) {
        const existing = await jobs.findOne({ userId, idempotencyKey });
        if (existing) {
          return docToJob(existing as unknown as Record<string, unknown>);
        }
      }

      const initialStatus: JobStatus = provider === 'ibm_quantum' ? 'submitted' : 'queued';
      const now = new Date();

      const doc = {
        _id: uuid(),
        userId,
        shots,
        qasmInput,
        codeType,
        backend,
        provider,
        providerJobId: providerJobId ?? null,
        status: initialStatus,
        statusDetail: null,
        limitsSnapshot,
        requestHash,
        idempotencyKey: idempotencyKey ?? null,
        noiseConfig: noiseConfig ?? null,
        errorCode: null,
        errorMessageSafe: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      };

      await jobs.insertOne(doc);
      return docToJob(doc as unknown as Record<string, unknown>);
    },

    async getJob(jobId: string): Promise<SimulationJob | null> {
      const doc = await jobs.findOne({ _id: jobId });
      return doc ? docToJob(doc as unknown as Record<string, unknown>) : null;
    },

    async transitionStatus(
      jobId: string,
      newStatus: JobStatus,
      extra?: {
        errorCode?: string;
        errorMessageSafe?: string;
        providerJobId?: string;
        statusDetail?: string;
      },
    ): Promise<SimulationJob | null> {
      const allowedFrom = Object.entries(VALID_TRANSITIONS)
        .filter(([, targets]) => targets.includes(newStatus))
        .map(([from]) => from);

      if (allowedFrom.length === 0) return null;

      const now = new Date();
      const setFields: Record<string, unknown> = {
        status: newStatus,
        updatedAt: now,
      };

      if (newStatus === 'running') {
        setFields.startedAt = now;
      }
      if (newStatus === 'completed' || newStatus === 'failed') {
        setFields.completedAt = now;
      }
      if (newStatus === 'cancelled') {
        setFields.cancelledAt = now;
      }
      if (extra?.errorCode !== undefined) {
        setFields.errorCode = extra.errorCode;
      }
      if (extra?.errorMessageSafe !== undefined) {
        setFields.errorMessageSafe = extra.errorMessageSafe;
      }
      if (extra?.providerJobId !== undefined) {
        setFields.providerJobId = extra.providerJobId;
      }
      if (extra?.statusDetail !== undefined) {
        setFields.statusDetail = extra.statusDetail;
      }

      // Use $set with conditional: only set timestamp if not already set
      const update: Record<string, unknown> = { $set: setFields };

      const result = await jobs.findOneAndUpdate(
        { _id: jobId, status: { $in: allowedFrom } },
        update,
        { returnDocument: 'after' },
      );

      return result ? docToJob(result as unknown as Record<string, unknown>) : null;
    },

    async storeResult(input: StoreResultInput): Promise<SimulationJobResult> {
      const now = new Date();
      const retentionUntil = new Date(now.getTime() + DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

      const doc = {
        _id: uuid(),
        jobId: input.jobId,
        countsJson: input.counts,
        metadataJson: input.metadata,
        rawResultJson: input.rawResult ?? null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        retentionUntil,
      };

      await results.insertOne(doc);
      return docToResult(doc as unknown as Record<string, unknown>);
    },

    async getResult(jobId: string): Promise<SimulationJobResult | null> {
      const doc = await results.findOne({
        jobId,
        retentionUntil: { $gt: new Date() },
      });
      return doc ? docToResult(doc as unknown as Record<string, unknown>) : null;
    },

    async getJobsByUser(userId: string, limit = 50): Promise<SimulationJob[]> {
      const docs = await jobs
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => docToJob(d as unknown as Record<string, unknown>));
    },

    async dequeueNextJob(): Promise<SimulationJob | null> {
      const now = new Date();
      const result = await jobs.findOneAndUpdate(
        { status: 'queued' },
        { $set: { status: 'running', startedAt: now, updatedAt: now } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      );
      return result ? docToJob(result as unknown as Record<string, unknown>) : null;
    },

    async purgeExpiredResults(): Promise<number> {
      const result = await results.deleteMany({ retentionUntil: { $lte: new Date() } });
      return result.deletedCount;
    },
  };
}
