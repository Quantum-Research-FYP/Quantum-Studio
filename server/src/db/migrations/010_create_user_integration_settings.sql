-- Per-user integration settings for external providers (e.g., IBM Quantum).
-- Tokens are stored encrypted at rest (AES-256-GCM); raw tokens never appear in logs or API responses.

CREATE TABLE IF NOT EXISTS user_integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_auth_tag TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid', 'error')),
  validation_error_code TEXT,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One setting per provider per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_integration_settings_user_provider
  ON user_integration_settings (user_id, provider);
