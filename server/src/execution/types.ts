// ---------------------------------------------------------------------------
// Execution Domain Types
// ---------------------------------------------------------------------------

/** Supported execution providers. */
export type ExecutionProvider = 'simulator' | 'ibm_quantum';

/**
 * Normalized execution job statuses.
 *
 * - submitted: Job accepted but not yet queued by the provider
 * - queued: Waiting in provider queue
 * - running: Actively executing on hardware/simulator
 * - completed: Finished successfully with results
 * - failed: Terminated with an error
 * - cancelled: User-initiated cancellation succeeded
 */
export type ExecutionJobStatus =
  | 'submitted'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Full execution job record (superset of the legacy SimulationJob). */
export interface ExecutionJob {
  id: string;
  createdByUserId: string;
  provider: ExecutionProvider;
  status: ExecutionJobStatus;
  shots: number;
  qasmInput: string;
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
}

// ---------------------------------------------------------------------------
// Audit Types
// ---------------------------------------------------------------------------

/** Actions tracked in the audit log. */
export type AuditAction =
  | 'job.submit'
  | 'job.cancel'
  | 'job.status_change'
  | 'credential.create'
  | 'credential.update'
  | 'credential.delete'
  | 'credential.validate';

/** Entity types referenced in audit entries. */
export type AuditEntityType = 'execution_job' | 'integration_settings';

/** A single audit log entry. */
export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  correlationId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Input for creating an audit log entry. Metadata must never contain secrets. */
export interface CreateAuditEntryInput {
  actorUserId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Status Mapping
// ---------------------------------------------------------------------------

/**
 * Maps IBM Quantum Runtime job statuses to our normalized statuses.
 * Unknown provider states map to the current status or 'queued' as fallback.
 */
export const IBM_STATUS_MAP: Record<string, ExecutionJobStatus> = {
  // IBM Qiskit Runtime statuses
  INITIALIZING: 'submitted',
  QUEUED: 'queued',
  VALIDATING: 'queued',
  RUNNING: 'running',
  DONE: 'completed',
  COMPLETED: 'completed',
  ERROR: 'failed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Resolve a raw IBM provider status string to our normalized status.
 * Returns 'queued' for unrecognized states (safe default that continues polling).
 */
export function normalizeIbmStatus(providerStatus: string): ExecutionJobStatus {
  return IBM_STATUS_MAP[providerStatus.toUpperCase()] ?? 'queued';
}

// ---------------------------------------------------------------------------
// Valid Status Transitions
// ---------------------------------------------------------------------------

/**
 * Defines which statuses can transition to which other statuses.
 * Transitions are monotonic (no going backwards).
 */
export const VALID_STATUS_TRANSITIONS: Record<ExecutionJobStatus, ExecutionJobStatus[]> = {
  submitted: ['queued', 'running', 'completed', 'failed', 'cancelled'],
  queued: ['running', 'completed', 'failed', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/** Check whether a status transition is valid. */
export function isValidTransition(from: ExecutionJobStatus, to: ExecutionJobStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
