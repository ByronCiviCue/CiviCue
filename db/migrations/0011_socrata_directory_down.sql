-- Rollback normalized Socrata directory schema
-- Drop in reverse dependency order

-- Drop compatibility view
DROP VIEW IF EXISTS catalog.socrata_municipality_index_v;

-- Drop tables in dependency order
DROP TABLE IF EXISTS catalog.socrata_agencies;
DROP TABLE IF EXISTS catalog.socrata_domains;  
DROP TABLE IF EXISTS catalog.socrata_hosts;