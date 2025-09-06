-- Seed reference dimensions (placeholder values; adjust later)
INSERT INTO core.dim_district (district, name, population, demographics) VALUES
  (1, 'District 1', NULL, NULL),
  (2, 'District 2', NULL, NULL),
  (3, 'District 3', NULL, NULL),
  (4, 'District 4', NULL, NULL),
  (5, 'District 5', NULL, NULL),
  (6, 'District 6', NULL, NULL),
  (7, 'District 7', NULL, NULL),
  (8, 'District 8', NULL, NULL),
  (9, 'District 9', NULL, NULL),
  (10, 'District 10', NULL, NULL),
  (11, 'District 11', NULL, NULL)
ON CONFLICT (district) DO NOTHING;

-- Optional placeholder supervisors (adjust later)
INSERT INTO core.dim_supervisor (supervisor_id, full_name, district, party, start_date, end_date) VALUES
  ('sup-01', 'TBD Supervisor 1', 1, NULL, NULL, NULL),
  ('sup-02', 'TBD Supervisor 2', 2, NULL, NULL, NULL)
ON CONFLICT (supervisor_id) DO NOTHING;