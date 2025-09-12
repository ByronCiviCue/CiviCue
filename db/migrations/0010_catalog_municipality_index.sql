-- Catalog schema for Socrata municipality index (hosts-level counts).
CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE IF NOT EXISTS catalog.socrata_municipality_index (
  host           text PRIMARY KEY,
  domain         text NOT NULL,
  region         text NOT NULL,         -- 'US' | 'EU' | etc.
  country        text,                  -- optional (NULL if unknown)
  city           text,                  -- optional best-effort
  agency_count   integer NOT NULL DEFAULT 0,
  dataset_count  integer NOT NULL DEFAULT 0,
  last_seen      timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL DEFAULT 'socrata',
  meta           jsonb                  -- raw crumbs (e.g., domain metadata)
);

CREATE INDEX IF NOT EXISTS socrata_muni_idx_region ON catalog.socrata_municipality_index(region);
CREATE INDEX IF NOT EXISTS socrata_muni_idx_agencycount ON catalog.socrata_municipality_index(agency_count DESC);
