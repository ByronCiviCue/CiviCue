-- Resume state table for durable pipeline progress tracking
-- Supports crash-safe resume functionality for catalog ingestion

CREATE TABLE catalog.resume_state (
  pipeline TEXT PRIMARY KEY,
  resume_token TEXT,
  last_processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for time-based queries
CREATE INDEX resume_state_updated_at_idx ON catalog.resume_state(updated_at);

-- Insert initial state for socrata catalog pipeline
INSERT INTO catalog.resume_state (pipeline, resume_token, last_processed_at) 
VALUES ('socrata_catalog', NULL, NULL)
ON CONFLICT (pipeline) DO NOTHING;