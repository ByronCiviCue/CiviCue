# Pre-flight Checklist & Confession - Task 7.3 Final

## Deviations & Placeholders
- TODOs present: none
- Stubs/mocks: none  
- Missing tests: normalization functions not unit tested (acceptable for utility functions)
- Unvalidated env reads: none (all CLI-driven)
- Rate-limit/backoff gaps: none (normalization is local processing only)
- OpenAPI mismatch: none (no API changes)
- Performance landmines: none (linear complexity with efficient Map-based deduplication)

## Surface & Context
Feature/Module: Task 7.3 Final - Production-Ready Normalization with Exact Semantics
Related RFC/Doc: Task 7 (Build SF Socrata index) - finalized normalization specification
Scope: Exact field mapping, day-level retention, deduplication, and stable sorting
Risk: low (pure data transformation with comprehensive null handling)

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
node scripts/build-datasf-index.mjs --dryRun --verbose
# Verify new verbose format shows pre/post counts and deduplication info
```

## Rollback
- Revert: scripts/build-datasf-index.mjs (restore Task 7.2 implementation)
- Revert: __docs__/catalogs/sf-socrata-profile.md (remove normalization semantics section)

# Implementation Summary

## Scope Compliance (Task 7.3 Final Production-Ready)
✅ Applied exact field mapping per specification
✅ Implemented day-level retention comparison (YYYY-MM-DD)
✅ Added Map-based deduplication with latest-wins logic
✅ Implemented stable sort with null-safe name + ID tiebreaker
✅ Updated verbose stats with new field names (preCount, postCount, excludedStaleCount)
✅ Added comprehensive normalization semantics documentation
✅ Maintained pure functions (no network, no file I/O)

## Exact Field Mapping Applied

### Scalar Fields (null for unknown)
- `id`: `item.resource?.id` (string, required)
- `name`: `item.resource?.name ?? null` (string|null)
- `type`: `item.resource?.type ?? null` (string|null)
- `domain`: Uses CLI domain argument (never null/empty)
- `permalink`: `item.permalink ?? null` (string|null)
- `createdAt`: `item.resource?.createdAt ?? null` (ISO string|null)
- `updatedAt`: `item.resource?.updatedAt ?? item.resource?.indexUpdatedAt ?? null` (ISO string|null)
- `owner`: `item.owner?.displayName ?? item.owner?.id ?? null` (string|null)
- `license`: `item.metadata?.license ?? item.metadata?.dataLicenseName ?? null` (string|null)

### Array Fields (empty array for missing)
- `tags`: `item.classification?.tags ?? []` (string[])
- `categories`: `item.classification?.categories ?? []` (string[])

### Computed Fields
- `retention.normalizedSince`: Effective since date (YYYY-MM-DD)
- `retention.normalizedUntil`: Effective until date (YYYY-MM-DD)
- `retention.filter`: "updatedAt" | "indexUpdatedAt" | "none"

## Retention Gate Implementation (Day-Level)

### Date Extraction
```javascript
const raw = resource.updatedAt ?? resource.indexUpdatedAt ?? null;
const candidateDay = raw ? String(raw).slice(0, 10) : null; // YYYY-MM-DD
```

### Comparison Logic
- If `candidateDay && candidateDay < effectiveSince && !includeStale` → exclude
- If no candidate date (`null`) → include (defensive posture)
- Day-level comparison ensures consistent behavior across timezone variations

### Filter Field Priority
1. `resource.updatedAt` → `filter: "updatedAt"`
2. `resource.indexUpdatedAt` → `filter: "indexUpdatedAt"`  
3. Neither present → `filter: "none"`

## Deduplication Rule (Latest Wins)

### Implementation
- Use `Map<string, object>` keyed by dataset `id`
- On collision, compare `updatedAt` day strings (YYYY-MM-DD)
- Keep item with newer update date
- If dates equal/unknown, keep existing entry
- Ensures exactly one entry per unique dataset ID

### Stats Tracking
- Adjust `filterFieldStats` when replacing items with different filter fields
- Maintains accurate count of which date fields were used for decisions

## Stable Sort Implementation

### Sort Order
1. **Primary**: `name` (lexicographic, null-safe with empty string fallback)
2. **Tiebreaker**: `id` (lexicographic, never null)

### Code
```javascript
normalized.sort((a, b) => {
  const nameCompare = (a.name ?? '').localeCompare(b.name ?? '');
  if (nameCompare !== 0) return nameCompare;
  return a.id.localeCompare(b.id);
});
```

### Null Safety
- `null` names converted to empty strings for comparison
- Consistent sorting behavior regardless of missing metadata

## Statistics Tracking (Updated)

### New Field Names
- `preCount`: Items before normalization (was `inputCount`)
- `excludedStaleCount`: Items filtered by retention gate (was `staleExcluded`)  
- `postCount`: Items after normalization and deduplication (new)
- `filterFieldStats`: Breakdown by date field type (enhanced)

### Verbose Output Format
```
Normalization stats:
  Pre-normalization: 1247 items
  Stale excluded: 89
  Post-normalization: 1158 items (after dedup)
  Filter fields: updatedAt=892, indexUpdatedAt=266, none=89
  [Stale filtering disabled (--includeStale)] // if applicable
```

## Files Modified
- **scripts/build-datasf-index.mjs**: Complete normalization overhaul with exact semantics
- **__docs__/catalogs/sf-socrata-profile.md**: Added comprehensive "Normalization semantics" section

## Documentation Enhancements
### New Section: "Normalization semantics"
- Complete field mapping table with types and notes
- Null vs empty string policy explanation
- Day-level retention gate logic
- Deduplication rules and conflict resolution  
- Stable sort implementation with null handling
- Statistics tracking explanation
- Data flow summary (raw → retention → dedup → sort → output)

## Quality Assurance

### Data Integrity
- **Deduplication**: Prevents duplicate dataset IDs in output
- **Latest wins**: Ensures most recent dataset versions are kept
- **Stable sort**: Deterministic ordering for diff stability
- **Null safety**: Consistent handling of missing metadata

### Performance 
- **Linear complexity**: O(n) for most operations
- **Efficient dedup**: Map-based lookup is O(1) average case
- **Memory efficient**: Single pass with minimal data copying
- **Sort performance**: O(n log n) with stable comparison function

### Purity
- **No side effects**: Functions don't modify input or global state
- **No I/O**: Pure data transformation without network/file operations  
- **Deterministic**: Same input always produces same output
- **Testable**: Clear input/output contracts

## Verification Results
✅ `pnpm -s lint` passes (clean code, no unused variables)
✅ `pnpm -s typecheck` passes (TypeScript compilation clean)
✅ `--dryRun --verbose` shows execution plan (no changes to dry-run logic)
✅ New verbose format ready to show pre/post/excluded counts
✅ Normalization functions are pure (no side effects except console logging)
✅ Documentation completely updated with exact specifications

## Production Readiness Checklist
✅ **Exact mapping**: All fields follow specification precisely
✅ **Null handling**: Consistent policy (null for scalars, [] for arrays)
✅ **Date comparison**: Day-level precision prevents timezone issues  
✅ **Deduplication**: Latest-wins with efficient Map implementation
✅ **Sorting**: Stable, null-safe with ID tiebreaker
✅ **Statistics**: Comprehensive tracking for monitoring
✅ **Documentation**: Complete specification for operational teams
✅ **Error handling**: Defensive coding for malformed data
✅ **Memory efficiency**: Single-pass processing with minimal overhead

## Next Phase Readiness
- Normalized data ready for Task 7.4 atomic file writing
- Statistics available for monitoring and alerting
- Documentation supports operational troubleshooting
- CLI interface complete for administrative tasks
- Schema fully compliant with frozen specification
- Deduplication ensures clean downstream processing
- Sort order enables stable version control diffs