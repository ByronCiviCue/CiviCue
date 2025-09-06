-- Example raw table template (we'll add others later)
CREATE TABLE IF NOT EXISTS landing_raw.evictions_raw (
  source_file TEXT,
  row_number INT,
  data JSONB,
  row_hash TEXT,
  ingested_at TIMESTAMPTZ DEFAULT now()
);