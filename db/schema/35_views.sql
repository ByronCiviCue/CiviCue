CREATE OR REPLACE VIEW core.v_evictions_report AS
SELECT case_number, address, filing_date, reason, district
FROM core.fact_evictions;