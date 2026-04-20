CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  tags JSONB,
  schema_version INTEGER NOT NULL DEFAULT 1,
  circuit_json JSONB NOT NULL,
  run_settings_json JSONB,
  latest_result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1
);

-- Covers the default list query: user's non-deleted experiments sorted by updatedAt desc
CREATE INDEX IF NOT EXISTS idx_experiments_owner_updated
  ON experiments (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Covers single-experiment lookups scoped by owner
CREATE INDEX IF NOT EXISTS idx_experiments_owner_id
  ON experiments (owner_user_id, id)
  WHERE deleted_at IS NULL;
