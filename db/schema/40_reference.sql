CREATE TABLE IF NOT EXISTS reference.supervisor_district_scd2 (
  supervisor_id TEXT,
  district INT,
  valid_from DATE,
  valid_to DATE,
  PRIMARY KEY (supervisor_id, valid_from)
);

CREATE TABLE IF NOT EXISTS reference.vote_file_metadata (
  file_no TEXT PRIMARY KEY,
  title TEXT,
  committee TEXT,
  subject TEXT,
  introduced_date DATE
);