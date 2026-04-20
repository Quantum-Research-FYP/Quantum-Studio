import { type Collection, type Db, type Document } from 'mongodb';
import { getDb } from './mongo.js';

/**
 * Standardised collection names — matching prior PostgreSQL table names for consistency.
 */
export const COLLECTIONS = {
  USERS: 'users',
  SESSIONS: 'sessions',
  EXPERIMENTS: 'experiments',
  SIMULATION_JOBS: 'simulation_jobs',
  SIMULATION_JOB_RESULTS: 'simulation_job_results',
  EXPERIMENT_SHARE_TOKENS: 'experiment_share_tokens',
  SHARE_AUDIT_EVENTS: 'share_audit_events',
  AUDIT_LOG: 'audit_log',
  USER_INTEGRATION_SETTINGS: 'user_integration_settings',
} as const;

/**
 * Base fields present on every persisted document.
 * Repositories extend this with entity-specific fields.
 */
export interface BaseDocument {
  _id: string;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Returns a typed MongoDB Collection handle for the given collection name.
 * Uses the active Db instance from connectMongo().
 */
export function getCollection<T extends Document = Document>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}

/**
 * Creates all required indexes for core query patterns.
 * Idempotent — MongoDB's createIndex is a no-op when the index already exists.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  console.log('[db] Ensuring indexes...');

  // --- users ---
  const users = db.collection(COLLECTIONS.USERS);
  await users.createIndex({ email: 1 }, { unique: true, name: 'idx_users_email_unique' });

  // --- sessions ---
  const sessions = db.collection(COLLECTIONS.SESSIONS);
  await sessions.createIndex(
    { userId: 1, expiresAt: 1 },
    { name: 'idx_sessions_userId_expiresAt' },
  );
  await sessions.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'idx_sessions_ttl' },
  );

  // --- experiments ---
  const experiments = db.collection(COLLECTIONS.EXPERIMENTS);
  await experiments.createIndex(
    { ownerId: 1, updatedAt: -1 },
    { name: 'idx_experiments_ownerId_updatedAt' },
  );
  await experiments.createIndex(
    { ownerId: 1, deletedAt: 1 },
    { name: 'idx_experiments_ownerId_deletedAt' },
  );

  // --- simulation_jobs ---
  const simulationJobs = db.collection(COLLECTIONS.SIMULATION_JOBS);
  await simulationJobs.createIndex(
    { experimentId: 1 },
    { name: 'idx_simulation_jobs_experimentId' },
  );
  await simulationJobs.createIndex(
    { userId: 1, createdAt: -1 },
    { name: 'idx_simulation_jobs_userId_createdAt' },
  );
  await simulationJobs.createIndex(
    { status: 1, createdAt: 1 },
    { name: 'idx_simulation_jobs_status_createdAt' },
  );

  // --- simulation_job_results ---
  const simulationJobResults = db.collection(COLLECTIONS.SIMULATION_JOB_RESULTS);
  await simulationJobResults.createIndex(
    { jobId: 1 },
    { unique: true, name: 'idx_simulation_job_results_jobId_unique' },
  );

  // --- experiment_share_tokens ---
  const shareTokens = db.collection(COLLECTIONS.EXPERIMENT_SHARE_TOKENS);
  await shareTokens.createIndex(
    { tokenHash: 1 },
    {
      unique: true,
      partialFilterExpression: { revokedAt: null },
      name: 'idx_share_tokens_tokenHash_active_unique',
    },
  );
  await shareTokens.createIndex(
    { experimentId: 1 },
    { name: 'idx_share_tokens_experimentId' },
  );

  // --- share_audit_events ---
  const shareAuditEvents = db.collection(COLLECTIONS.SHARE_AUDIT_EVENTS);
  await shareAuditEvents.createIndex(
    { experimentId: 1, createdAt: -1 },
    { name: 'idx_share_audit_events_experimentId' },
  );
  await shareAuditEvents.createIndex(
    { actorUserId: 1, createdAt: -1 },
    { name: 'idx_share_audit_events_actorUserId' },
  );

  // --- audit_log ---
  const auditLog = db.collection(COLLECTIONS.AUDIT_LOG);
  await auditLog.createIndex(
    { entityType: 1, entityId: 1, createdAt: -1 },
    { name: 'idx_audit_log_entity' },
  );
  await auditLog.createIndex(
    { actorUserId: 1, createdAt: -1 },
    { name: 'idx_audit_log_actorUserId' },
  );

  // --- user_integration_settings ---
  const integrationSettings = db.collection(COLLECTIONS.USER_INTEGRATION_SETTINGS);
  await integrationSettings.createIndex(
    { userId: 1, provider: 1 },
    { unique: true, name: 'idx_integration_settings_userId_provider_unique' },
  );

  console.log('[db] Indexes ensured successfully.');
}
