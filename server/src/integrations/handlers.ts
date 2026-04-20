import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'node:crypto';
import { createIntegrationsRepository } from './repository.js';
import { validateIbmToken } from './ibm-validation.js';
import { createAuditRepository } from '../execution/audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER = 'ibm_quantum';

/** Stable error codes for API responses. */
const ERROR_CODES = {
  FEATURE_DISABLED: 'IBM_QUANTUM_DISABLED',
  MISSING_TOKEN: 'MISSING_TOKEN',
  INVALID_TOKEN_FORMAT: 'INVALID_TOKEN_FORMAT',
  INVALID_TOKEN: 'INVALID_TOKEN',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  NOT_FOUND: 'SETTINGS_NOT_FOUND',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIbmQuantumEnabled(): boolean {
  return process.env.ENABLE_IBM_QUANTUM === 'true';
}

/** Map validation error codes to user-facing messages. */
function validationErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'INVALID_TOKEN':
      return 'The IBM Quantum token is invalid or has been revoked.';
    case 'NETWORK_ERROR':
      return 'Unable to reach IBM Quantum services. Please try again later.';
    case 'PROVIDER_UNAVAILABLE':
      return 'IBM Quantum services are temporarily unavailable.';
    case 'PROVIDER_RATE_LIMITED':
      return 'IBM Quantum rate limit exceeded. Please wait before retrying.';
    default:
      return 'An unexpected validation error occurred.';
  }
}

// ---------------------------------------------------------------------------
// Handler Factory
// ---------------------------------------------------------------------------

export function createIntegrationsHandlers(pool: Db) {
  const repo = createIntegrationsRepository(pool);
  const audit = createAuditRepository(pool);

  return {
    /**
     * POST /api/integrations/ibm-quantum/settings
     * Create or update IBM Quantum credentials.
     */
    async saveSettings(req: Request, res: Response): Promise<void> {
      if (!isIbmQuantumEnabled()) {
        res.status(503).json({
          error: 'IBM Quantum integration is not enabled.',
          errorCode: ERROR_CODES.FEATURE_DISABLED,
        });
        return;
      }

      const userId = req.user!.id;
      const { token } = req.body ?? {};

      // Validate input
      if (!token || typeof token !== 'string') {
        res.status(400).json({
          error: 'A non-empty token string is required.',
          errorCode: ERROR_CODES.MISSING_TOKEN,
        });
        return;
      }

      if (token.trim().length < 10) {
        res.status(400).json({
          error: 'Token appears too short to be valid.',
          errorCode: ERROR_CODES.INVALID_TOKEN_FORMAT,
        });
        return;
      }

      const correlationId = crypto.randomUUID();

      // Check if this is a create or update
      const existing = await repo.getSettings(userId, PROVIDER);
      const auditAction = existing ? 'credential.update' : 'credential.create';

      // Encrypt and store
      let settings;
      try {
        settings = await repo.upsertSettings(userId, PROVIDER, token.trim());
      } catch (err) {
        console.error('[integrations] Encryption/storage error:', (err as Error).message);
        res.status(500).json({
          error: 'Failed to store credentials securely.',
          errorCode: ERROR_CODES.ENCRYPTION_ERROR,
        });
        return;
      }

      // Attempt validation (non-blocking for storage — we already saved)
      const validationResult = await validateIbmToken(token.trim());

      if (validationResult.valid) {
        settings = await repo.updateValidationStatus(userId, PROVIDER, 'valid');
      } else {
        settings = await repo.updateValidationStatus(
          userId,
          PROVIDER,
          validationResult.errorCode === 'INVALID_TOKEN' ? 'invalid' : 'error',
          validationResult.errorCode,
        );
      }

      // Audit log (never includes the token)
      await audit.log({
        actorUserId: userId,
        action: auditAction,
        entityType: 'integration_settings',
        entityId: settings!.id,
        correlationId,
        metadata: {
          provider: PROVIDER,
          validationStatus: settings!.validationStatus,
          validationErrorCode: settings!.validationErrorCode,
        },
      });

      // Return masked response with validation outcome
      const response: Record<string, unknown> = { ...settings };
      if (!validationResult.valid) {
        response.validationMessage = validationErrorMessage(validationResult.errorCode);
      }

      res.status(existing ? 200 : 201).json(response);
    },

    /**
     * GET /api/integrations/ibm-quantum/settings
     * Fetch masked settings (never returns the raw token).
     */
    async getSettings(req: Request, res: Response): Promise<void> {
      if (!isIbmQuantumEnabled()) {
        res.status(503).json({
          error: 'IBM Quantum integration is not enabled.',
          errorCode: ERROR_CODES.FEATURE_DISABLED,
        });
        return;
      }

      const userId = req.user!.id;
      const settings = await repo.getSettings(userId, PROVIDER);

      if (!settings) {
        res.status(404).json({
          error: 'No IBM Quantum settings configured.',
          errorCode: ERROR_CODES.NOT_FOUND,
        });
        return;
      }

      res.status(200).json(settings);
    },

    /**
     * DELETE /api/integrations/ibm-quantum/settings
     * Remove stored credentials.
     */
    async deleteSettings(req: Request, res: Response): Promise<void> {
      if (!isIbmQuantumEnabled()) {
        res.status(503).json({
          error: 'IBM Quantum integration is not enabled.',
          errorCode: ERROR_CODES.FEATURE_DISABLED,
        });
        return;
      }

      const userId = req.user!.id;
      const correlationId = crypto.randomUUID();

      const existing = await repo.getSettings(userId, PROVIDER);
      if (!existing) {
        res.status(404).json({
          error: 'No IBM Quantum settings configured.',
          errorCode: ERROR_CODES.NOT_FOUND,
        });
        return;
      }

      await repo.deleteSettings(userId, PROVIDER);

      // Audit log
      await audit.log({
        actorUserId: userId,
        action: 'credential.delete',
        entityType: 'integration_settings',
        entityId: existing.id,
        correlationId,
        metadata: { provider: PROVIDER },
      });

      res.status(204).send();
    },
  };
}
