CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE IF NOT EXISTS catalog.socrata_municipality_index (
  host TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('US','EU')),
  country TEXT,
  city TEXT,
  agency_count INTEGER NOT NULL DEFAULT 0,
  dataset_count INTEGER NOT NULL DEFAULT 0,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'socrata.discovery',
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_socrata_muni_region ON catalog.socrata_municipality_index(region);