-- Socrata Dataset Registry Migration
-- Adds dataset-level tracking for discovered Socrata datasets

CREATE TABLE IF NOT EXISTS catalog.socrata_datasets (
  dataset_id TEXT NOT NULL,
  host TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  tags TEXT[],
  publisher TEXT,
  updated_at TIMESTAMPTZ,
  row_count BIGINT,
  view_count BIGINT,
  link TEXT,
  active BOOLEAN DEFAULT TRUE,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (host, dataset_id)
);

-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_socrata_datasets_host ON catalog.socrata_datasets(host);
CREATE INDEX IF NOT EXISTS idx_socrata_datasets_category ON catalog.socrata_datasets(category);
CREATE INDEX IF NOT EXISTS idx_socrata_datasets_updated_desc ON catalog.socrata_datasets(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_socrata_datasets_active ON catalog.socrata_datasets(active) WHERE active = TRUE;

-- Composite index for frequent host+active filtering pattern
CREATE INDEX IF NOT EXISTS idx_socrata_datasets_host_active ON catalog.socrata_datasets(host, active) WHERE active = TRUE;

-- Note: Foreign key to socrata_hosts.host intentionally deferred
-- Will be added once host registry is stable and fully populated
-- Future: ALTER TABLE catalog.socrata_datasets ADD CONSTRAINT fk_dataset_host 
--         FOREIGN KEY (host) REFERENCES catalog.socrata_hosts(host) ON DELETE CASCADE;