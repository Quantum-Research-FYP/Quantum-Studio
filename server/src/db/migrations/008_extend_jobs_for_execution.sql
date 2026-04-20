-- Extend simulation_jobs to support multiple execution providers (simulator + IBM Quantum).
-- All new columns are nullable or have defaults to maintain backward compatibility.

-- Add provider column (defaults to 'simulator' for existing rows)
ALTER TABLE simulation_jobs
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'simulator';

-- Add IBM-specific fields
ALTER TABLE simulation_jobs
  ADD COLUMN IF NOT EXISTS provider_job_id TEXT,
  ADD COLUMN IF NOT EXISTS status_detail TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Expand the status CHECK constraint to include 'submitted' and 'cancelled'
ALTER TABLE simulation_jobs
  DROP CONSTRAINT IF EXISTS simulation_jobs_status_check;

ALTER TABLE simulation_jobs
  ADD CONSTRAINT simulation_jobs_status_check
    CHECK (status IN ('submitted', 'queued', 'running', 'completed', 'failed', 'cancelled'));

-- Index on provider for filtered queries
CREATE INDEX IF NOT EXISTS idx_simulation_jobs_provider ON simulation_jobs (provider);

-- Index on provider_job_id for lookups by external job reference
CREATE INDEX IF NOT EXISTS idx_simulation_jobs_provider_job_id ON simulation_jobs (provider_job_id)
  WHERE provider_job_id IS NOT NULL;
