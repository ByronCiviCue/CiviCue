CREATE TABLE IF NOT EXISTS staging_clean.evictions (
  case_number TEXT,
  address TEXT,
  filing_date DATE,
  reason TEXT,
  district INT,
  row_hash TEXT PRIMARY KEY,
  ingested_at TIMESTAMPTZ
);