-- Add AI provenance fields to experiments table
ALTER TABLE experiments
  ADD COLUMN ai_assisted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN ai_provider VARCHAR(50),
  ADD COLUMN ai_model VARCHAR(100),
  ADD COLUMN ai_generated_at TIMESTAMPTZ,
  ADD COLUMN ai_code_hash VARCHAR(64),
  ADD COLUMN ai_prompt TEXT,
  ADD COLUMN ai_explanation TEXT,
  ADD COLUMN ai_generated_code TEXT,
  ADD COLUMN ai_share_provenance BOOLEAN NOT NULL DEFAULT false;
