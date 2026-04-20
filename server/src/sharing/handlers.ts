/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Request, Response } from 'express';
import { createSharingRepository, generateRawToken, hashToken } from './repository.js';
import type { Visibility } from './repository.js';
import {
  isSupportedVersion,
  isNewerVersion,
  migrateExperimentPayload,
} from '../experiments/schema-migration.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_VISIBILITIES = new Set<Visibility>(['private', 'unlisted', 'public']);

function isValidVisibility(value: unknown): value is Visibility {
  return typeof value === 'string' && VALID_VISIBILITIES.has(value as Visibility);
}

function isPublicSharingEnabled(): boolean {
  return process.env.ENABLE_PUBLIC_SHARING === 'true';
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function createSharingHandlers(pool: any) {
  const repo = createSharingRepository(pool);

  return {
    /**
     * GET /api/shared/experiments/:id?token=...
     * Public endpoint — no authentication required.
     * Returns a safe subset of experiment data for shared viewing.
     */
    async getSharedExperiment(req: Request, res: Response): Promise<void> {
      try {
        const experimentId = req.params.id as string;
        const rawToken = req.query.token as string | undefined;

        const experiment = await repo.getExperimentForSharedView(experimentId);

        // Non-existent or soft-deleted → 404 (no disclosure)
        if (!experiment) {
          res.status(404).json({ error: 'Not found.' });
          return;
        }

        const { visibility } = experiment;

        // Private → always 404 for non-owners on this endpoint
        if (visibility === 'private') {
          res.status(404).json({ error: 'Not found.' });
          return;
        }

        // Unlisted → require valid token
        if (visibility === 'unlisted') {
          if (!rawToken) {
            res.status(404).json({ error: 'Not found.' });
            return;
          }

          const tokenHash = hashToken(rawToken);
          const matchedExperimentId = await repo.findExperimentByTokenHash(tokenHash);

          if (matchedExperimentId !== experimentId) {
            res.status(404).json({ error: 'Not found.' });
            return;
          }
        }

        // Public → no token needed (but check feature flag)
        if (visibility === 'public' && !isPublicSharingEnabled()) {
          res.status(404).json({ error: 'Not found.' });
          return;
        }

        // Schema version checks (same logic as owner endpoint)
        if (isNewerVersion(experiment.schemaVersion) || !isSupportedVersion(experiment.schemaVersion)) {
          res.status(404).json({ error: 'Not found.' });
          return;
        }

        // Migrate payload if needed
        const migrated = migrateExperimentPayload({
          ...experiment,
          ownerUserId: '',
          runSettingsJson: null,
          deletedAt: null,
          rowVersion: 0,
          aiCodeHash: null,
        });

        // AI provenance: always include aiAssisted flag; detailed fields only when owner opted in
        const aiFields: Record<string, unknown> = {
          aiAssisted: experiment.aiAssisted,
        };
        if (experiment.aiAssisted) {
          aiFields.aiProvider = experiment.aiProvider;
          aiFields.aiModel = experiment.aiModel;
          aiFields.aiGeneratedAt = experiment.aiGeneratedAt;
          // Prompt/explanation/code only when owner has opted in to share them
          if (experiment.aiShareProvenance) {
            aiFields.aiPrompt = experiment.aiPrompt;
            aiFields.aiExplanation = experiment.aiExplanation;
            aiFields.aiGeneratedCode = experiment.aiGeneratedCode;
          }
        }

        // Return only the safe subset — no owner info, no run settings
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.status(200).json({
          id: migrated.id,
          name: migrated.name,
          description: migrated.description,
          tags: migrated.tags,
          schemaVersion: migrated.schemaVersion,
          circuitJson: migrated.circuitJson,
          latestResultJson: migrated.latestResultJson,
          visibility: experiment.visibility,
          createdAt: migrated.createdAt,
          updatedAt: migrated.updatedAt,
          ...aiFields,
        });
      } catch (err) {
        console.error('Get shared experiment error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /**
     * PATCH /api/experiments/:id/visibility
     * Owner-only. Updates experiment visibility.
     * Auto-revokes active token when switching away from unlisted.
     */
    async updateVisibility(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;
        const { visibility } = req.body ?? {};

        if (!isValidVisibility(visibility)) {
          res.status(400).json({
            error: 'Visibility must be one of: private, unlisted, public.',
            errorCode: 'VALIDATION_VISIBILITY',
          });
          return;
        }

        // Block public if feature flag is disabled
        if (visibility === 'public' && !isPublicSharingEnabled()) {
          res.status(400).json({
            error: 'Public sharing is not enabled.',
            errorCode: 'PUBLIC_SHARING_DISABLED',
          });
          return;
        }

        // Check ownership
        const info = await repo.getExperimentOwnership(experimentId);
        if (!info) {
          res.status(404).json({ error: 'Experiment not found.' });
          return;
        }
        if (info.ownerUserId !== userId) {
          res.status(403).json({ error: 'Forbidden.' });
          return;
        }

        const previousVisibility = info.visibility;

        // No-op if visibility is unchanged
        if (previousVisibility === visibility) {
          res.status(200).json({ id: experimentId, visibility });
          return;
        }

        // Update visibility
        await repo.updateVisibility(experimentId, userId, visibility);

        // Auto-revoke token when switching away from unlisted
        if (previousVisibility === 'unlisted' && visibility !== 'unlisted') {
          const revoked = await repo.revokeActiveToken(experimentId);
          if (revoked) {
            await repo.recordAuditEvent(userId, experimentId, 'TOKEN_REVOKED', {
              reason: 'visibility_change',
              fromVisibility: previousVisibility,
              toVisibility: visibility,
            });
          }
        }

        await repo.recordAuditEvent(userId, experimentId, 'VISIBILITY_CHANGED', {
          from: previousVisibility,
          to: visibility,
        });

        console.log(
          `[sharing] action=visibility-changed userId=${userId} experimentId=${experimentId} from=${previousVisibility} to=${visibility}`,
        );

        res.status(200).json({ id: experimentId, visibility });
      } catch (err) {
        console.error('Update visibility error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /**
     * GET /api/experiments/:id/share-link
     * Owner-only. Returns the share URL, creating a token if none exists.
     * Only works when visibility is unlisted.
     */
    async getShareLink(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const info = await repo.getExperimentOwnership(experimentId);
        if (!info) {
          res.status(404).json({ error: 'Experiment not found.' });
          return;
        }
        if (info.ownerUserId !== userId) {
          res.status(403).json({ error: 'Forbidden.' });
          return;
        }

        if (info.visibility !== 'unlisted') {
          res.status(400).json({
            error: 'Share links are only available for unlisted experiments.',
            errorCode: 'VISIBILITY_NOT_UNLISTED',
          });
          return;
        }

        // Check for existing active token
        const existingToken = await repo.getActiveToken(experimentId);

        if (existingToken) {
          // We cannot recover the raw token from the hash, so generate a new one
          // only if explicitly requested via rotate. For GET, we indicate a token exists.
          // However, the spec says "creating a token if needed" — if one exists,
          // we can't return the raw value. Rotate endpoint handles new token issuance.
          // Return a flag indicating a token exists and provide the share URL pattern.
          res.status(200).json({
            id: experimentId,
            hasToken: true,
            message: 'A share token already exists. Use the rotate endpoint to generate a new one.',
          });
          return;
        }

        // No active token — create one
        const rawToken = generateRawToken();
        const tokenHash = hashToken(rawToken);
        await repo.createToken(experimentId, tokenHash);

        await repo.recordAuditEvent(userId, experimentId, 'TOKEN_CREATED', {});

        console.log(
          `[sharing] action=token-created userId=${userId} experimentId=${experimentId}`,
        );

        // Build share URL (protocol + host from request)
        const shareUrl = buildShareUrl(req, experimentId, rawToken);

        res.status(200).json({
          id: experimentId,
          hasToken: true,
          shareUrl,
          token: rawToken,
        });
      } catch (err) {
        console.error('Get share link error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /**
     * POST /api/experiments/:id/share-token/rotate
     * Owner-only. Revokes the current token and issues a new one.
     */
    async rotateToken(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const info = await repo.getExperimentOwnership(experimentId);
        if (!info) {
          res.status(404).json({ error: 'Experiment not found.' });
          return;
        }
        if (info.ownerUserId !== userId) {
          res.status(403).json({ error: 'Forbidden.' });
          return;
        }

        if (info.visibility !== 'unlisted') {
          res.status(400).json({
            error: 'Token rotation is only available for unlisted experiments.',
            errorCode: 'VISIBILITY_NOT_UNLISTED',
          });
          return;
        }

        // Revoke existing token (if any)
        await repo.revokeActiveToken(experimentId);

        // Issue new token
        const rawToken = generateRawToken();
        const tokenHash = hashToken(rawToken);
        await repo.createToken(experimentId, tokenHash);

        await repo.recordAuditEvent(userId, experimentId, 'TOKEN_ROTATED', {});

        console.log(
          `[sharing] action=token-rotated userId=${userId} experimentId=${experimentId}`,
        );

        const shareUrl = buildShareUrl(req, experimentId, rawToken);

        res.status(200).json({
          id: experimentId,
          shareUrl,
          token: rawToken,
        });
      } catch (err) {
        console.error('Rotate token error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },

    /**
     * DELETE /api/experiments/:id/share-token
     * Owner-only. Revokes the active token without issuing a new one.
     */
    async revokeToken(req: Request, res: Response): Promise<void> {
      try {
        const userId = req.user!.id;
        const experimentId = req.params.id as string;

        const info = await repo.getExperimentOwnership(experimentId);
        if (!info) {
          res.status(404).json({ error: 'Experiment not found.' });
          return;
        }
        if (info.ownerUserId !== userId) {
          res.status(403).json({ error: 'Forbidden.' });
          return;
        }

        const revoked = await repo.revokeActiveToken(experimentId);
        if (revoked) {
          await repo.recordAuditEvent(userId, experimentId, 'TOKEN_REVOKED', {});

          console.log(
            `[sharing] action=token-revoked userId=${userId} experimentId=${experimentId}`,
          );
        }

        res.status(204).send();
      } catch (err) {
        console.error('Revoke token error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full share URL from the request's origin. */
function buildShareUrl(req: Request, experimentId: string, rawToken: string): string {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  return `${proto}://${host}/shared/${encodeURIComponent(experimentId)}?token=${encodeURIComponent(rawToken)}`;
}
