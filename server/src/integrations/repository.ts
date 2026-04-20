import type pg from 'pg';
import { encrypt, decrypt, type EncryptedPayload } from '../execution/encryption.js';

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

/** Internal record with encrypted token fields (for decryption). */
interface IntegrationSettingsRow {
  id: string;
  user_id: string;
  provider: string;
  encrypted_token: string;
  token_iv: string;
  token_auth_tag: string;
  validation_status: ValidationStatus;
  validation_error_code: string | null;
  last_validated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToMasked(row: IntegrationSettingsRow): IntegrationSettingsMasked {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    hasToken: Boolean(row.encrypted_token),
    validationStatus: row.validation_status,
    validationErrorCode: row.validation_error_code ?? null,
    lastValidatedAt: row.last_validated_at ? row.last_validated_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createIntegrationsRepository(pool: pg.Pool) {
  return {
    /**
     * Create or update integration settings for a user+provider.
     * The raw token is encrypted before storage.
     * Returns the masked settings (never the token).
     */
    async upsertSettings(
      userId: string,
      provider: string,
      rawToken: string,
    ): Promise<IntegrationSettingsMasked> {
      const { ciphertext, iv, authTag } = encrypt(rawToken);

      const result = await pool.query(
        `INSERT INTO user_integration_settings
           (user_id, provider, encrypted_token, token_iv, token_auth_tag, validation_status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (user_id, provider)
         DO UPDATE SET
           encrypted_token = EXCLUDED.encrypted_token,
           token_iv = EXCLUDED.token_iv,
           token_auth_tag = EXCLUDED.token_auth_tag,
           validation_status = 'pending',
           validation_error_code = NULL,
           last_validated_at = NULL,
           updated_at = now()
         RETURNING *`,
        [userId, provider, ciphertext, iv, authTag],
      );

      return rowToMasked(result.rows[0] as IntegrationSettingsRow);
    },

    /**
     * Fetch masked settings for a user+provider.
     * Returns null if no settings exist.
     */
    async getSettings(
      userId: string,
      provider: string,
    ): Promise<IntegrationSettingsMasked | null> {
      const result = await pool.query(
        `SELECT * FROM user_integration_settings
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider],
      );

      if (result.rows.length === 0) return null;
      return rowToMasked(result.rows[0] as IntegrationSettingsRow);
    },

    /**
     * Decrypt and return the raw token for internal use (e.g., calling IBM APIs).
     * Returns null if no settings exist.
     * NEVER expose this value in API responses or logs.
     */
    async getDecryptedToken(userId: string, provider: string): Promise<string | null> {
      const result = await pool.query(
        `SELECT encrypted_token, token_iv, token_auth_tag
         FROM user_integration_settings
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider],
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0] as Pick<
        IntegrationSettingsRow,
        'encrypted_token' | 'token_iv' | 'token_auth_tag'
      >;

      const payload: EncryptedPayload = {
        ciphertext: row.encrypted_token,
        iv: row.token_iv,
        authTag: row.token_auth_tag,
      };

      return decrypt(payload);
    },

    /**
     * Delete integration settings for a user+provider.
     * Returns true if a row was deleted, false if nothing existed.
     */
    async deleteSettings(userId: string, provider: string): Promise<boolean> {
      const result = await pool.query(
        `DELETE FROM user_integration_settings
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider],
      );
      return (result.rowCount ?? 0) > 0;
    },

    /**
     * Update validation status after an IBM API check.
     */
    async updateValidationStatus(
      userId: string,
      provider: string,
      status: ValidationStatus,
      errorCode?: string,
    ): Promise<IntegrationSettingsMasked | null> {
      const result = await pool.query(
        `UPDATE user_integration_settings
         SET validation_status = $3,
             validation_error_code = $4,
             last_validated_at = now(),
             updated_at = now()
         WHERE user_id = $1 AND provider = $2
         RETURNING *`,
        [userId, provider, status, errorCode ?? null],
      );

      if (result.rows.length === 0) return null;
      return rowToMasked(result.rows[0] as IntegrationSettingsRow);
    },
  };
}
