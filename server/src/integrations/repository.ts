import type { Db } from 'mongodb';
import { v4 as uuid } from 'uuid';
import { encrypt, decrypt, type EncryptedPayload } from '../execution/encryption.js';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'error';

/** Public-facing settings (token is never exposed). */
export interface IntegrationSettingsMasked {
  id: string;
  userId: string;
  provider: string;
  hasToken: boolean;
  validationStatus: ValidationStatus;
  validationErrorCode: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function docToMasked(doc: Record<string, unknown>): IntegrationSettingsMasked {
  return {
    id: doc._id as string,
    userId: doc.userId as string,
    provider: doc.provider as string,
    hasToken: Boolean(doc.encryptedToken),
    validationStatus: doc.validationStatus as ValidationStatus,
    validationErrorCode: (doc.validationErrorCode as string) ?? null,
    lastValidatedAt: doc.lastValidatedAt ? (doc.lastValidatedAt as Date).toISOString() : null,
    createdAt: (doc.createdAt as Date).toISOString(),
    updatedAt: (doc.updatedAt as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createIntegrationsRepository(pool: Db) {
  const settings = pool.collection<AppDocument>(COLLECTIONS.USER_INTEGRATION_SETTINGS);

  return {
    async upsertSettings(
      userId: string,
      provider: string,
      rawToken: string,
    ): Promise<IntegrationSettingsMasked> {
      const { ciphertext, iv, authTag } = encrypt(rawToken);
      const now = new Date();

      const result = await settings.findOneAndUpdate(
        { userId, provider },
        {
          $set: {
            encryptedToken: ciphertext,
            tokenIv: iv,
            tokenAuthTag: authTag,
            validationStatus: 'pending',
            validationErrorCode: null,
            lastValidatedAt: null,
            updatedAt: now,
          },
          $setOnInsert: {
            _id: uuid(),
            userId,
            provider,
            schemaVersion: 1,
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );

      return docToMasked(result as unknown as Record<string, unknown>);
    },

    async getSettings(userId: string, provider: string): Promise<IntegrationSettingsMasked | null> {
      const doc = await settings.findOne({ userId, provider });
      if (!doc) return null;
      return docToMasked(doc as unknown as Record<string, unknown>);
    },

    async getDecryptedToken(userId: string, provider: string): Promise<string | null> {
      const doc = await settings.findOne(
        { userId, provider },
        { projection: { encryptedToken: 1, tokenIv: 1, tokenAuthTag: 1 } },
      );

      if (!doc) return null;

      const payload: EncryptedPayload = {
        ciphertext: doc.encryptedToken as string,
        iv: doc.tokenIv as string,
        authTag: doc.tokenAuthTag as string,
      };

      return decrypt(payload);
    },

    async deleteSettings(userId: string, provider: string): Promise<boolean> {
      const result = await settings.deleteOne({ userId, provider });
      return result.deletedCount > 0;
    },

    async updateValidationStatus(
      userId: string,
      provider: string,
      status: ValidationStatus,
      errorCode?: string,
    ): Promise<IntegrationSettingsMasked | null> {
      const now = new Date();
      const result = await settings.findOneAndUpdate(
        { userId, provider },
        {
          $set: {
            validationStatus: status,
            validationErrorCode: errorCode ?? null,
            lastValidatedAt: now,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );

      if (!result) return null;
      return docToMasked(result as unknown as Record<string, unknown>);
    },
  };
}
