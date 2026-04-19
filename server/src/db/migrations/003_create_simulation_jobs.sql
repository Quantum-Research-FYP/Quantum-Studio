CREATE TABLE IF NOT EXISTS simulation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  shots INTEGER NOT NULL,
  qasm_input TEXT NOT NULL,
  backend TEXT NOT NULL DEFAULT 'aer_simulator',
  limits_snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message_safe TEXT,
  request_hash TEXT,
  idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_simulation_jobs_user_id ON simulation_jobs (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_simulation_jobs_status ON simulation_jobs (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_simulation_jobs_idempotency
  ON simulation_jobs (created_by_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
