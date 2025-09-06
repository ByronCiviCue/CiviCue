-- 1) No null business keys in staging
SELECT COUNT(*) AS null_case_numbers
FROM staging_clean.evictions
WHERE case_number IS NULL;

-- 2) All districts in staging must exist in dim_district
SELECT COUNT(*) AS missing_district_refs
FROM staging_clean.evictions s
LEFT JOIN core.dim_district d USING (district)
WHERE s.district IS NOT NULL
  AND d.district IS NULL;