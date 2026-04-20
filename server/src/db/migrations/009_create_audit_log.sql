-- Audit log for tracking security-sensitive and compliance-relevant actions.
-- Never stores secrets (tokens, passwords, keys) in the metadata column.

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query patterns: by actor (recent activity), by entity (history of an object)
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
  ON audit_log (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log (entity_type, entity_id, created_at DESC);
