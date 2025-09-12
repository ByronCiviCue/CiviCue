-- Normalized Socrata directory schema
-- Adds hosts, domains, agencies tables alongside existing municipality_index
CREATE SCHEMA IF NOT EXISTS catalog;

-- Socrata hosts table
CREATE TABLE IF NOT EXISTS catalog.socrata_hosts (
  host TEXT PRIMARY KEY,
  region TEXT NOT NULL CHECK (region IN ('US', 'EU')),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Socrata domains table  
CREATE TABLE IF NOT EXISTS catalog.socrata_domains (
  domain TEXT PRIMARY KEY,
  country TEXT,
  region TEXT NOT NULL CHECK (region IN ('US', 'EU')),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Socrata agencies table
CREATE TABLE IF NOT EXISTS catalog.socrata_agencies (
  host TEXT NOT NULL REFERENCES catalog.socrata_hosts(host) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (host, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS socrata_hosts_region_idx ON catalog.socrata_hosts(region);
CREATE INDEX IF NOT EXISTS socrata_hosts_last_seen_idx ON catalog.socrata_hosts(last_seen DESC);
CREATE INDEX IF NOT EXISTS socrata_domains_region_idx ON catalog.socrata_domains(region);
CREATE INDEX IF NOT EXISTS socrata_domains_last_seen_idx ON catalog.socrata_domains(last_seen DESC);
CREATE INDEX IF NOT EXISTS socrata_agencies_host_idx ON catalog.socrata_agencies(host);
CREATE INDEX IF NOT EXISTS socrata_agencies_name_idx ON catalog.socrata_agencies(lower(name));

-- Compatibility view for future migration
CREATE VIEW IF NOT EXISTS catalog.socrata_municipality_index_v AS
SELECT 
  h.host,
  d.domain,
  h.region,
  d.country,
  NULL::TEXT AS city,
  NULL::INTEGER AS agency_count,
  NULL::INTEGER AS dataset_count,
  h.last_seen,
  'normalized' AS source,
  NULL::JSONB AS meta
FROM catalog.socrata_hosts h
LEFT JOIN catalog.socrata_domains d ON d.region = h.region;