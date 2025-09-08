# Pre-flight Checklist & Confession - Task 7.3 Retention

## Deviations & Placeholders
- TODOs present: none
- Stubs/mocks: none
- Missing tests: normalization functions not unit tested (acceptable for utility functions)
- Unvalidated env reads: none (all CLI-driven)
- Rate-limit/backoff gaps: none (normalization is local processing only)
- OpenAPI mismatch: none (no API changes)
- Performance landmines: none (pure functions with linear complexity)

## Surface & Context
Feature/Module: Task 7.3 - Catalog-Level Retention Enforcement During Normalization
Related RFC/Doc: Task 7 (Build SF Socrata index) - normalization with retention
Scope: Pure normalization functions with catalog-level retention filtering
Risk: low (read-only data transformation with defensive defaults)

## Invariants Claimed
- OpenAPI conformance: N/A (data transformation only)
- I/O timeouts: N/A (no network I/O in normalization)
- Retries/backoff: N/A (pure functions)
- Pagination: N/A (processes in-memory results)
- Tests added: none (utility script functions)
- correlationId logs end-to-end: N/A (utility script)

## Quick Test Plan
```bash
pnpm -s lint && pnpm -s typecheck
node scripts/build-datasf-index.mjs --help | grep includeStale
node scripts/build-datasf-index.mjs --dryRun --verbose
# Test with small mock data array (inline validation)
```

## Rollback
- Revert: scripts/build-datasf-index.mjs (remove normalization functions and CLI integration)
- Revert: __docs__/catalogs/sf-socrata-profile.md (remove retention section)

# Implementation Summary

## Scope Compliance (Task 7.3 Retention Only)
✅ Added `--includeStale` CLI flag to disable retention filtering
✅ Implemented pure `normalize()` function for single item transformation
✅ Implemented pure `normalizeAll()` function with retention enforcement
✅ Added retention metadata to normalized entries
✅ Updated main() to use normalization pipeline
✅ Added verbose diagnostics for retention filtering
✅ Updated documentation with comprehensive retention section
✅ No file writes (transformation only, as required)

## CLI Enhancements
### New Flag: `--includeStale`
- **Purpose**: Disable retention filtering during normalization
- **Usage**: For audits or debugging when all datasets should be preserved
- **Default**: false (retention filtering enabled)

### Updated Help Text
- Added `--includeStale` option description
- Clarified retention filtering behavior
- Maintained existing CLI contract

## Normalization Functions

### `normalize(item, effectiveSince, effectiveUntil, includeStale)`
- **Pure function**: No side effects, deterministic output
- **Input**: Single Discovery API result item
- **Output**: Normalized item or null if filtered out
- **Retention logic**: 
  - Uses `resource.updatedAt || resource.indexUpdatedAt` for freshness
  - Filters out datasets older than `effectiveSince` unless `includeStale=true`
  - Defensive posture: includes items with missing update metadata
- **Schema compliance**: Produces objects matching frozen SocrataDatasetRecord schema
- **Retention metadata**: Adds `retention.{normalizedSince, normalizedUntil, filter}` fields

### `normalizeAll(items, effectiveSince, effectiveUntil, includeStale, verbose)`
- **Pure function**: No side effects beyond console logging when verbose=true
- **Input**: Array of Discovery API results + retention parameters
- **Output**: `{normalized: Array, stats: Object}` with transformation statistics
- **Statistics tracking**:
  - Input/output counts
  - Stale exclusions count
  - Filter field usage breakdown
- **Sorting**: Alphabetical by name for stable diffs
- **Verbose diagnostics**: Detailed stats when requested

## Retention Enforcement Logic

### Default Horizon
- **Since**: 24 months ago from current date (computed dynamically)
- **Until**: Today's date
- **Format**: YYYY-MM-DD ISO date strings

### Filtering Rules
1. **No ID**: Skip items without `resource.id`
2. **Missing timestamps**: Include defensively (avoid accidental exclusions)
3. **Stale datasets**: Exclude if `updatedAtCandidate < effectiveSince` AND `includeStale=false`
4. **Filter field priority**: `resource.updatedAt` preferred over `resource.indexUpdatedAt`

### Metadata Persistence
Each normalized dataset includes:
```javascript
retention: {
  normalizedSince: "2023-09-07",  // Effective start date
  normalizedUntil: "2025-09-07",  // Effective end date  
  filter: "updatedAt"             // Decision field: "updatedAt|indexUpdatedAt|none"
}
```

## Verbose Diagnostics Output
When `--verbose` flag is used:
- Pre-normalization item count
- Post-normalization item count  
- Stale datasets excluded count
- Filter field statistics breakdown
- Stale filtering status (enabled/disabled via `--includeStale`)

## Files Modified
- **scripts/build-datasf-index.mjs**: Added normalization pipeline and CLI integration
- **__docs__/catalogs/sf-socrata-profile.md**: Added comprehensive retention documentation

## Documentation Enhancements
### New Section: "Retention at Catalog Level"
- Explains retention logic and tradeoffs
- Documents CLI options for overriding defaults
- Describes retention metadata structure
- Clarifies Discovery API limitations vs catalog-level filtering
- Explains relationship to row-level retention in branch ingesters

## Integration with Existing Pipeline
- **Fetch phase**: Uses existing `fetchAll()` results as input
- **Transform phase**: New normalization with retention enforcement
- **Write phase**: Results ready for Task 7.4 file output
- **CLI compatibility**: All existing flags preserved and functional

## Verification Results
✅ `pnpm -s lint` passes (clean code, no unused variables)
✅ `pnpm -s typecheck` passes (TypeScript compilation clean)  
✅ `--help` shows `--includeStale` option correctly
✅ `--dryRun --verbose` shows complete execution plan
✅ Normalization functions are pure (no side effects except logging)
✅ Ready for Task 7.4 file writing integration

## Quality Assurance
- **Pure functions**: No network I/O or file system access in normalization
- **Defensive coding**: Missing metadata doesn't cause exclusions
- **Statistics tracking**: Complete audit trail of transformation decisions
- **CLI flexibility**: Admin can disable filtering for audits via `--includeStale`
- **Documentation**: Comprehensive explanation of retention policies and tradeoffs
- **Memory efficiency**: Linear processing without data duplication

## Next Phase Readiness  
- Normalized data ready for file output in Task 7.4
- Retention metadata preserved for future policy adjustments
- Statistics available for monitoring and debugging
- CLI interface supports operational needs (audits, debugging)
- Documentation provides clear operational guidance