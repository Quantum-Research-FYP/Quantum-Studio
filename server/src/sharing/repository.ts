/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';

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

export function createSharingRepository(pool: any) {
  return {
    /**
     * Fetch experiment ownership and visibility info.
     * Returns null if experiment does not exist or is soft-deleted.
     */
    async getExperimentOwnership(experimentId: string): Promise<ExperimentOwnershipInfo | null> {
      const result = await pool.query(
        `SELECT id, owner_user_id, visibility FROM experiments
         WHERE id = $1 AND deleted_at IS NULL`,
        [experimentId],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        visibility: row.visibility as Visibility,
      };
    },

    /**
     * Fetch an experiment for the shared viewer (no owner scoping).
     * Returns the safe subset of data: circuit + results, no run settings or owner email.
     */
    async getExperimentForSharedView(experimentId: string): Promise<SharedExperimentView | null> {
      const result = await pool.query(
        `SELECT id, name, description, tags, schema_version, circuit_json,
                latest_result_json, visibility, created_at, updated_at,
                ai_assisted, ai_provider, ai_model, ai_generated_at,
                ai_prompt, ai_explanation, ai_generated_code, ai_share_provenance
         FROM experiments
         WHERE id = $1 AND deleted_at IS NULL`,
        [experimentId],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        id: row.id as string,
        name: row.name as string,
        description: (row.description as string) ?? null,
        tags: (row.tags as string[]) ?? null,
        schemaVersion: row.schema_version as number,
        circuitJson: row.circuit_json as Record<string, unknown>,
        latestResultJson: (row.latest_result_json as Record<string, unknown>) ?? null,
        visibility: row.visibility as Visibility,
        createdAt: (row.created_at as Date).toISOString(),
        updatedAt: (row.updated_at as Date).toISOString(),
        aiAssisted: (row.ai_assisted as boolean) ?? false,
        aiProvider: (row.ai_provider as string) ?? null,
        aiModel: (row.ai_model as string) ?? null,
        aiGeneratedAt: row.ai_generated_at ? (row.ai_generated_at as Date).toISOString() : null,
        aiPrompt: (row.ai_prompt as string) ?? null,
        aiExplanation: (row.ai_explanation as string) ?? null,
        aiGeneratedCode: (row.ai_generated_code as string) ?? null,
        aiShareProvenance: (row.ai_share_provenance as boolean) ?? false,
      };
    },

    /**
     * Get the active (non-revoked) share token for an experiment.
     */
    async getActiveToken(experimentId: string): Promise<ShareToken | null> {
      const result = await pool.query(
        `SELECT id, experiment_id, token_hash, created_at, revoked_at
         FROM experiment_share_tokens
         WHERE experiment_id = $1 AND revoked_at IS NULL`,
        [experimentId],
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        id: row.id as string,
        experimentId: row.experiment_id as string,
        tokenHash: row.token_hash as string,
        createdAt: (row.created_at as Date).toISOString(),
        revokedAt: null,
      };
    },

    /**
     * Look up an experiment by active token hash.
     * Used to validate shared viewer access for unlisted experiments.
     */
    async findExperimentByTokenHash(tokenHash: string): Promise<string | null> {
      const result = await pool.query(
        `SELECT experiment_id FROM experiment_share_tokens
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      );
      return result.rows.length > 0 ? (result.rows[0].experiment_id as string) : null;
    },

    /**
     * Create a new share token for an experiment.
     * Caller must ensure no active token exists (or revoke it first).
     */
    async createToken(experimentId: string, tokenHash: string): Promise<ShareToken> {
      const result = await pool.query(
        `INSERT INTO experiment_share_tokens (experiment_id, token_hash)
         VALUES ($1, $2)
         RETURNING id, experiment_id, token_hash, created_at, revoked_at`,
        [experimentId, tokenHash],
      );
      const row = result.rows[0];
      return {
        id: row.id as string,
        experimentId: row.experiment_id as string,
        tokenHash: row.token_hash as string,
        createdAt: (row.created_at as Date).toISOString(),
        revokedAt: null,
      };
    },

    /**
     * Revoke the active token for an experiment (if any).
     * Returns true if a token was revoked, false if none was active.
     */
    async revokeActiveToken(experimentId: string): Promise<boolean> {
      const result = await pool.query(
        `UPDATE experiment_share_tokens
         SET revoked_at = now()
         WHERE experiment_id = $1 AND revoked_at IS NULL`,
        [experimentId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    /**
     * Update the visibility of an experiment (owner-scoped).
     * Returns true if updated, false if not found or not owned.
     */
    async updateVisibility(
      experimentId: string,
      userId: string,
      visibility: Visibility,
    ): Promise<boolean> {
      const result = await pool.query(
        `UPDATE experiments
         SET visibility = $3, updated_at = now()
         WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`,
        [experimentId, userId, visibility],
      );
      return (result.rowCount ?? 0) > 0;
    },

    /**
     * Record a share-related audit event.
     */
    async recordAuditEvent(
      actorUserId: string,
      experimentId: string,
      action: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> {
      await pool.query(
        `INSERT INTO share_audit_events (actor_user_id, experiment_id, action, metadata)
         VALUES ($1, $2, $3, $4)`,
        [actorUserId, experimentId, action, metadata ? JSON.stringify(metadata) : null],
      );
    },
  };
}
