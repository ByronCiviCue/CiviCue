-- Ensure schema exists (no-op if present)
CREATE SCHEMA IF NOT EXISTS catalog;

-- Create composite unique index on (host, domain)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'catalog'
      AND indexname = 'ux_socrata_muni_index_host_domain'
  ) THEN
    CREATE UNIQUE INDEX ux_socrata_muni_index_host_domain
      ON catalog.socrata_municipality_index (host, domain);
  END IF;
END
$$;