-- Dimensions
CREATE TABLE IF NOT EXISTS core.dim_supervisor (
  supervisor_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  district INT,
  party TEXT,
  start_date DATE,
  end_date DATE
);

CREATE TABLE IF NOT EXISTS core.dim_district (
  district INT PRIMARY KEY,
  name TEXT,
  population INT,
  demographics JSONB
);

-- Facts
CREATE TABLE IF NOT EXISTS core.fact_evictions (
  eviction_id SERIAL PRIMARY KEY,
  case_number TEXT UNIQUE,
  address TEXT,
  filing_date DATE,
  reason TEXT,
  district INT REFERENCES core.dim_district(district),
  supervisor_id TEXT REFERENCES core.dim_supervisor(supervisor_id),
  source TEXT,
  ingested_at TIMESTAMPTZ
);