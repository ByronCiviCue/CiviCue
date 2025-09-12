# Pre-flight Checklist & Confession - Task 7.4

## Deviations & Placeholders
- TODOs present: none
- Stubs/mocks: none
- Missing tests: none (script-level testing acceptable)
- Unvalidated env reads: none (handled by env resolver)
- Rate-limit/backoff gaps: none (handled by 7.2)
- OpenAPI mismatch: none (no API changes)
- Performance landmines: none (streaming not needed for directory)

## Surface & Context
Feature/Module: Task 7.4 - Discovery orchestration and atomic write
Related RFC/Doc: Task 7 (Build SF Socrata index)
Scope: Orchestrate fetch → normalize → write with safety checks
Risk: low (read-only from API, atomic write to filesystem)

## Invariants Claimed
- OpenAPI conformance: N/A (utility script)
- I/O timeouts: handled by socrataFetch with retry logic
- Retries/backoff: delegated to 7.2 fetchAll implementation
- Pagination: scroll pagination handled by 7.2 fetchAll
- Tests added: none (utility script)
- correlationId logs end-to-end: N/A (utility script)

## Quick Test Plan
```bash
# Dry run (no network/write)
node scripts/build-datasf-index.mjs --dryRun

# Live with safety override
SOCRATA_APP_TOKEN=... node scripts/build-datasf-index.mjs --includeStale

# Verify output structure
jq '.schemaVersion, .totalCount' municipalities/CA/SF/directory.json
```

## Rollback
- Delete municipalities/CA/SF/directory.json if malformed
- Revert script changes to restore 7.3 state
- Remove atomic write implementation

# Implementation Summary

## Scope Compliance (Task 7.4 Only)
✅ Fixed import paths from dist/ to source with .js specifiers
✅ Added fs/promises and path imports for file operations
✅ Implemented atomic write with temp file → rename pattern
✅ Added safety threshold check (200 datasets minimum)
✅ Built exact frozen payload schema with no extra keys
✅ Proper exit codes: 0 success, 1 safety failure
✅ Clean up temp file on write errors
✅ Updated documentation with Assembly & Atomic Write section

## Orchestration Implementation
- Uses existing 7.2 fetchAll for Discovery API calls
- Uses existing 7.3 normalizeAll for retention and deduplication
- Computes effectiveSince/effectiveUntil consistently with 7.3
- Builds frozen payload schema exactly as specified
- Implements 200 dataset safety threshold with --includeStale override

## Atomic Write Strategy
- Creates output directory if missing (recursive mkdir)
- Writes to temporary file with .tmp suffix
- Atomic rename to final path on success
- Cleanup temp file on any write errors
- Pretty printed JSON with 2-space indent

## Files Modified
- **scripts/build-datasf-index.mjs**: Fixed imports, added orchestration and atomic write
- **__docs__/catalogs/sf-socrata-profile.md**: Added Assembly & Atomic Write section

## Documentation Enhancements
### New Section: "Assembly & Atomic Write"
- Frozen payload schema specification
- Atomic write strategy explanation
- Safety threshold documentation (200 minimum, --includeStale override)
- Exit code definitions (0 success, 1 safety failure)
- Note that no diagnostics are written to output file

## Quality Assurance
- **Import fixes**: Changed from dist/ to source imports as required
- **Safety threshold**: 200 datasets minimum with --includeStale override
- **Atomic writes**: Temp file pattern prevents partial writes
- **Error handling**: Cleanup on failure, proper exit codes
- **Schema compliance**: Exact frozen payload, no extra fields
- **Documentation**: Complete specification for operational teams

## Verification Results
✅ Source imports implemented (no dist/ imports)
✅ Frozen payload schema with exact structure
✅ Safety threshold: 200 datasets, --includeStale override only
✅ Atomic write with temp file cleanup on error
✅ Proper exit codes and error messages
✅ Documentation updated with corrected __docs__ path
✅ No network calls in dry-run mode preserved
✅ domains=<host> parameter maintained by existing fetchAll

## Next Phase Readiness
- Directory file ready for consumption by Epic 8 dataset clients
- Safety thresholds ensure quality output
- Atomic writes prevent corruption during generation
- Documentation supports operational deployment
- Orchestration complete for Task 7 (Discovery catalog layer)