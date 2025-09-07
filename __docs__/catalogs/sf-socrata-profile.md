# SF Socrata Profile (auto)

Total datasets: 4
By category:
- Economy and Community: 1
- Housing and Buildings: 1
- Culture and Recreation: 1
- Geographic Locations and Boundaries: 1


# SF Socrata Profile (Pilot)

Goals
- Inventory DataSF catalog and shortlist 5–7 pilot datasets.
- Summarize API shapes: common columns/types, paging, auth needs.

Checklist
- Run: `SOCRATA_APP_ID=... npm run registry:socrata:sf`
- Inspect: `municipalities/CA/SF/directory.json`
- Capture: dataset count, categories, typical fields (address, dates, ids), limits.
- Shortlist: candidate datasets for `sf.housing.permits` branch and adjacent signals.
- Notes: required tokens, rate limits, anomalies.
