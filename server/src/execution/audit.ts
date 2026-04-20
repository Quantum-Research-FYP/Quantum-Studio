import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type { AuditLogEntry, CreateAuditEntryInput } from './types.js';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

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

function docToEntry(doc: Record<string, unknown>): AuditLogEntry {
  return {
    id: doc._id as string,
    actorUserId: doc.actorUserId as string,
    action: doc.action as AuditLogEntry['action'],
    entityType: doc.entityType as AuditLogEntry['entityType'],
    entityId: doc.entityId as string,
    correlationId: doc.correlationId as string,
    metadata: (doc.metadata as Record<string, unknown>) ?? {},
    createdAt: (doc.createdAt as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createAuditRepository(pool: Db) {
  const auditLog = pool.collection<AppDocument>(COLLECTIONS.AUDIT_LOG);

  return {
    async log(input: CreateAuditEntryInput): Promise<AuditLogEntry> {
      const correlationId = input.correlationId ?? crypto.randomUUID();
      const metadata = input.metadata ? sanitizeMetadata(input.metadata) : {};
      const now = new Date();

      const doc = {
        _id: crypto.randomUUID(),
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId,
        metadata,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      };

      await auditLog.insertOne(doc);
      return docToEntry(doc as unknown as Record<string, unknown>);
    },

    async getByEntity(
      entityType: string,
      entityId: string,
      limit = 50,
    ): Promise<AuditLogEntry[]> {
      const docs = await auditLog
        .find({ entityType, entityId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => docToEntry(d as unknown as Record<string, unknown>));
    },

    async getByActor(actorUserId: string, limit = 50): Promise<AuditLogEntry[]> {
      const docs = await auditLog
        .find({ actorUserId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => docToEntry(d as unknown as Record<string, unknown>));
    },
  };
}
