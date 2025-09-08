# Pre-flight Checklist & Confession - SF Registry Population

## Population Summary
- **Domain**: data.sfgov.org  
- **Output**: municipalities/CA/SF/directory.json
- **API Switch**: Changed from Discovery API to Dataset API (`/api/views`)
- **Results**: 762 datasets populated (from 1000 fetched, 238 filtered as stale)
- **Validator Result**: PASS - all validations successful, threshold ≥200 met

## Root Cause & Fix
- **Problem**: Discovery API (`api.us.socrata.com/api/catalog/v1`) returned 0-4 datasets for SF domain
- **Solution**: Switched to Dataset API (`https://data.sfgov.org/api/views`) with offset/limit pagination
- **Key Changes**:
  - Updated `fetchAll()` to use domain-specific Dataset API endpoint
  - Implemented duplicate detection to handle API pagination edge cases
  - Updated `normalize()` to handle Dataset API response schema (epoch timestamps → ISO)
  - Added epoch-to-ISO conversion helper for dates

## Safety Checks Verified
- **Threshold**: 762 datasets > 200 minimum requirement (no --allowLowCount needed)
- **Atomic Write**: Confirmed .tmp → rename pattern used
- **Schema Validation**: All 762 datasets conform to frozen 7.3 normalized schema
- **Retention Window**: 2023-09-08 to 2025-09-08 applied (238 stale items filtered)
- **Domain Integrity**: All datasets correctly tagged with data.sfgov.org

## Inputs & Configuration
- Domain: data.sfgov.org
- Output: municipalities/CA/SF/directory.json  
- Page Size: 1000 items per request
- Retention: Default 24-month window (238 items excluded as stale)
- Deduplication: Built-in by ID (no duplicates found in final output)
- Network: 1 API page fetched (2nd page all duplicates, correctly detected)

## Code Changes Applied
1. **fetchAll() function**: 
   - FROM: `https://api.us.socrata.com/api/catalog/v1` with scroll
   - TO: `https://${domain}/api/views` with offset/limit + duplicate detection
2. **normalize() function**:
   - Added `epochToIso()` helper for timestamp conversion
   - Updated field mapping for Dataset API schema
   - Preserved retention filtering and 7.3 frozen output schema
3. **Dry run messaging**: Updated to reflect Dataset API usage

## No Changes Made To
- Validator (scripts/validate-datasf-index.mjs) - unchanged, still enforces correct schema
- Package.json scripts - unchanged
- CLI flags and options - all preserved
- Safety thresholds and atomic write logic - unchanged

## Quality Gates Passed
- Dry run: ✅ Showed correct plan with Dataset API endpoint
- Live build: ✅ 762 datasets fetched and normalized
- Validation: ✅ All schema checks passed, exit code 0
- File integrity: ✅ JSON structure correct, totalCount matches datasets.length

## First 5 Datasets (Sample)
1. uan2-8hmm: (Deprecation Warning) Meter Inventory
2. kkr3-wq7h: [Archived] COVID-19 Deaths by Population Characteristics Over Time  
3. 3tsy-c2sd: [Historical Only] 311 Top Articles Referenced
4. an34-qeyq: [Historical] Campaign Consultants Filings
5. wppz-u2hi: 100-Year Storm Flood Elevations (December 2024)