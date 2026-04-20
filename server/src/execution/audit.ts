import type pg from 'pg';
import crypto from 'node:crypto';
import type { AuditLogEntry, CreateAuditEntryInput } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sensitive keys that must never appear in audit metadata. */
const FORBIDDEN_METADATA_KEYS = new Set([
  'token',
  'apiToken',
  'api_token',
  'secret',
  'password',
  'credential',
  'encryptedToken',
  'encrypted_token',
]);

/** Strip any forbidden keys from metadata before persistence. */
function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!FORBIDDEN_METADATA_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function rowToEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    actorUserId: row.actor_user_id as string,
    action: row.action as AuditLogEntry['action'],
    entityType: row.entity_type as AuditLogEntry['entityType'],
    entityId: row.entity_id as string,
    correlationId: row.correlation_id as string,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createAuditRepository(pool: pg.Pool) {
  return {
    /**
     * Append an audit log entry. Metadata is sanitized to prevent secret leakage.
     * Returns the created entry.
     */
    async log(input: CreateAuditEntryInput): Promise<AuditLogEntry> {
      const correlationId = input.correlationId ?? crypto.randomUUID();
      const metadata = input.metadata ? sanitizeMetadata(input.metadata) : {};

      const result = await pool.query(
        `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.actorUserId,
          input.action,
          input.entityType,
          input.entityId,
          correlationId,
          JSON.stringify(metadata),
        ],
      );

      return rowToEntry(result.rows[0]);
    },

    /**
     * Retrieve audit entries for a specific entity, ordered by most recent first.
     */
    async getByEntity(
      entityType: string,
      entityId: string,
      limit = 50,
    ): Promise<AuditLogEntry[]> {
      const result = await pool.query(
        `SELECT * FROM audit_log
         WHERE entity_type = $1 AND entity_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [entityType, entityId, limit],
      );
      return result.rows.map(rowToEntry);
    },

    /**
     * Retrieve recent audit entries for a specific user, ordered by most recent first.
     */
    async getByActor(actorUserId: string, limit = 50): Promise<AuditLogEntry[]> {
      const result = await pool.query(
        `SELECT * FROM audit_log
         WHERE actor_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [actorUserId, limit],
      );
      return result.rows.map(rowToEntry);
    },
  };
}
