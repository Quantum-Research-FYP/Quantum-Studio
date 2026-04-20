-- Migration 006: Add experiment sharing support
-- Adds visibility to experiments, share token storage, and audit events table.

-- 1. Add visibility column to experiments (default private for all existing rows)
ALTER TABLE experiments
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private';

ALTER TABLE experiments
  ADD CONSTRAINT chk_experiments_visibility
  CHECK (visibility IN ('private', 'unlisted', 'public'));

-- Index for querying public experiments (shared viewer listing, if needed later)
CREATE INDEX IF NOT EXISTS idx_experiments_visibility
  ON experiments (visibility)
  WHERE deleted_at IS NULL AND visibility != 'private';

-- 2. Share tokens table (stores only hashed tokens, never raw values)
CREATE TABLE IF NOT EXISTS experiment_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Enforce at most one active (non-revoked) token per experiment
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tokens_active_experiment
  ON experiment_share_tokens (experiment_id)
  WHERE revoked_at IS NULL;

-- Fast lookup by token hash for shared viewer access validation
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tokens_hash
  ON experiment_share_tokens (token_hash)
  WHERE revoked_at IS NULL;

-- 3. Audit events table for share-management actions
CREATE TABLE IF NOT EXISTS share_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-experiment audit trail lookup
CREATE INDEX IF NOT EXISTS idx_share_audit_experiment_time
  ON share_audit_events (experiment_id, created_at DESC);
