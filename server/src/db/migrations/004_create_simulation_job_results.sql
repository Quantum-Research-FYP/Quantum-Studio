CREATE TABLE IF NOT EXISTS simulation_job_results (
  job_id UUID PRIMARY KEY REFERENCES simulation_jobs(id) ON DELETE CASCADE,
  counts_json JSONB NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  raw_result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);
