# Cross-Tag Dependency Audit

## Summary

- **Total tasks processed:** 90
- **Tasks with cross-tag dependencies:** 6  
- **Total dependency edges:** 9
- **Status:** Dependencies normalized with canonical tags

## Alias Resolution

The following alias mappings were applied during normalization:

| Alias | Canonical Tag |
|-------|---------------|
| APP   | App           |

## Cross-Tag Dependencies (Normalized)

- **API.23** → Database.69 (hybrid search requires vector store)
- **Database.67** → API.62 (core schema depends on adapter contracts)  
- **Database.69** → Database.67 (municipality registry depends on core schema)
- **Admin.1** → API.62, Database.67, Database.69 (dashboards depend on data flow)
- **Admin.3** → API.62 (operational metrics depend on IO policy)
- **Infra.3** → API.62, App.1 (CI depends on adapter baselines)

## Normalization Changes

- **Infra.3**: Removed duplicate dependency "APP.1" (now using canonical "App.1")
- All dependency IDs now use canonical tag names consistently
- De-duplicated case variants to eliminate redundancy

## Missing References

No missing references found after normalization. All dependency targets exist in tasks.json.

## Implementation Details

Normalization process:
1. Built canonical tag map from tasks.json structure
2. Applied alias mapping: ADP→App, ADM→Admin, DB→Database, VEC→Vector, INFRA→Infra, APP→App
3. Normalized case variants to match canonical tags exactly
4. De-duplicated identical dependencies after normalization
5. Verified all normalized targets exist in tasks.json

---
*Generated: 2025-09-11T19:30:45.000Z*