import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import { v4 as uuid } from 'uuid';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Visibility = 'private' | 'unlisted' | 'public';

export interface ShareToken {
  id: string;
  experimentId: string;
  tokenHash: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface SharedExperimentView {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  circuitJson: Record<string, unknown>;
  latestResultJson: Record<string, unknown> | null;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  aiAssisted: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  aiGeneratedAt: string | null;
  aiPrompt: string | null;
  aiExplanation: string | null;
  aiGeneratedCode: string | null;
  aiShareProvenance: boolean;
}

export interface ExperimentOwnershipInfo {
  id: string;
  ownerUserId: string;
  visibility: Visibility;
}

// ---------------------------------------------------------------------------
// Token utilities
// ---------------------------------------------------------------------------

/** Generate a cryptographically random base64url token (192 bits = 32 chars). */
export function generateRawToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Compute SHA-256 hash of a raw token, returned as lowercase hex (64 chars). */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createSharingRepository(pool: Db) {
  const experiments = pool.collection<AppDocument>(COLLECTIONS.EXPERIMENTS);
  const shareTokens = pool.collection<AppDocument>(COLLECTIONS.EXPERIMENT_SHARE_TOKENS);
  const shareAuditEvents = pool.collection<AppDocument>(COLLECTIONS.SHARE_AUDIT_EVENTS);

  return {
    async getExperimentOwnership(experimentId: string): Promise<ExperimentOwnershipInfo | null> {
      const doc = await experiments.findOne(
        { _id: experimentId, deletedAt: null },
        { projection: { _id: 1, ownerId: 1, visibility: 1 } },
      );
      if (!doc) return null;
      return {
        id: doc._id as string,
        ownerUserId: doc.ownerId as string,
        visibility: doc.visibility as Visibility,
      };
    },

    async getExperimentForSharedView(experimentId: string): Promise<SharedExperimentView | null> {
      const doc = await experiments.findOne(
        { _id: experimentId, deletedAt: null },
        {
          projection: {
            _id: 1,
            name: 1,
            description: 1,
            tags: 1,
            schemaVersion: 1,
            circuitJson: 1,
            latestResultJson: 1,
            visibility: 1,
            createdAt: 1,
            updatedAt: 1,
            aiAssisted: 1,
            aiProvider: 1,
            aiModel: 1,
            aiGeneratedAt: 1,
            aiPrompt: 1,
            aiExplanation: 1,
            aiGeneratedCode: 1,
            aiShareProvenance: 1,
          },
        },
      );
      if (!doc) return null;
      return {
        id: doc._id as string,
        name: doc.name as string,
        description: (doc.description as string) ?? null,
        tags: (doc.tags as string[]) ?? null,
        schemaVersion: doc.schemaVersion as number,
        circuitJson: doc.circuitJson as Record<string, unknown>,
        latestResultJson: (doc.latestResultJson as Record<string, unknown>) ?? null,
        visibility: doc.visibility as Visibility,
        createdAt: (doc.createdAt as Date).toISOString(),
        updatedAt: (doc.updatedAt as Date).toISOString(),
        aiAssisted: (doc.aiAssisted as boolean) ?? false,
        aiProvider: (doc.aiProvider as string) ?? null,
        aiModel: (doc.aiModel as string) ?? null,
        aiGeneratedAt: doc.aiGeneratedAt ? (doc.aiGeneratedAt as Date).toISOString() : null,
        aiPrompt: (doc.aiPrompt as string) ?? null,
        aiExplanation: (doc.aiExplanation as string) ?? null,
        aiGeneratedCode: (doc.aiGeneratedCode as string) ?? null,
        aiShareProvenance: (doc.aiShareProvenance as boolean) ?? false,
      };
    },

    async getActiveToken(experimentId: string): Promise<ShareToken | null> {
      const doc = await shareTokens.findOne({
        experimentId,
        revokedAt: null,
      });
      if (!doc) return null;
      return {
        id: doc._id as string,
        experimentId: doc.experimentId as string,
        tokenHash: doc.tokenHash as string,
        createdAt: (doc.createdAt as Date).toISOString(),
        revokedAt: null,
      };
    },

    async findExperimentByTokenHash(tokenHash: string): Promise<string | null> {
      const doc = await shareTokens.findOne(
        { tokenHash, revokedAt: null },
        { projection: { experimentId: 1 } },
      );
      return doc ? (doc.experimentId as string) : null;
    },

    async createToken(experimentId: string, tokenHash: string): Promise<ShareToken> {
      const now = new Date();
      const doc = {
        _id: uuid(),
        experimentId,
        tokenHash,
        revokedAt: null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      };

      await shareTokens.insertOne(doc);
      return {
        id: doc._id,
        experimentId: doc.experimentId,
        tokenHash: doc.tokenHash,
        createdAt: doc.createdAt.toISOString(),
        revokedAt: null,
      };
    },

    async revokeActiveToken(experimentId: string): Promise<boolean> {
      const result = await shareTokens.updateOne(
        { experimentId, revokedAt: null },
        { $set: { revokedAt: new Date(), updatedAt: new Date() } },
      );
      return result.modifiedCount > 0;
    },

    async updateVisibility(
      experimentId: string,
      userId: string,
      visibility: Visibility,
    ): Promise<boolean> {
      const result = await experiments.updateOne(
        { _id: experimentId, ownerId: userId, deletedAt: null },
        { $set: { visibility, updatedAt: new Date() } },
      );
      return result.modifiedCount > 0;
    },

    async recordAuditEvent(
      actorUserId: string,
      experimentId: string,
      action: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> {
      await shareAuditEvents.insertOne({
        _id: uuid(),
        actorUserId,
        experimentId,
        action,
        metadata: metadata ?? null,
        schemaVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
  };
}
