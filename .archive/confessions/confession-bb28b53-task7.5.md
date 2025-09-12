# Pre-flight Checklist & Confession - Task 7.5

## Deviations & Placeholders
- TODOs present: none
- Stubs/mocks: none  
- Missing tests: none (validator is self-contained verification)
- Unvalidated env reads: none (uses fs/promises only)
- Rate-limit/backoff gaps: none (validator reads local file only)
- OpenAPI mismatch: N/A (utility script)
- Performance landmines: none (single file read, synchronous validation)

## Surface & Context
Feature/Module: Task 7.5 - SF Socrata Registry Validation & CI
Related RFC/Doc: Task 7 (Build SF Socrata index)
Scope: Validator script, npm scripts, CI integration, documentation
Risk: low (read-only validation, deterministic exit codes)

## Invariants Claimed
- OpenAPI conformance: N/A (utility script)
- I/O timeouts: N/A (local file read only)
- Retries/backoff: N/A (no network calls)
- Pagination: N/A (validates complete file)
- Tests added: Validator itself is the test for registry output
- correlationId logs end-to-end: N/A (utility script)

## Quick Test Plan
```bash
# Build index first (requires SOCRATA_APP_TOKEN)
SOCRATA_APP_TOKEN=... pnpm run registry:socrata:sf:build

# Validate the output
pnpm run registry:socrata:sf:validate

# Combined build + validate
SOCRATA_APP_TOKEN=... pnpm run registry:socrata:sf:rebuild

# Test with low count warning mode (should NOT be used in CI)
node scripts/validate-datasf-index.mjs --allowLowCount
```

## Rollback
- Remove scripts/validate-datasf-index.mjs
- Remove added npm scripts from package.json
- Remove CI validation step from .github/workflows/ci.yml
- Revert documentation changes

# Implementation Summary

## Validation Rules (scripts/validate-datasf-index.mjs)
✅ Strict Zod schema validation with .strict() for no extra keys
✅ Header validation: schemaVersion===1, source==='socrata'
✅ Domain matching with configurable --domain flag
✅ ISO 8601 validation for generatedAt
✅ YYYY-MM-DD format validation for retention dates
✅ Retention range validation (since ≤ until)
✅ Count integrity: totalCount === datasets.length
✅ Dataset shape: exact 7.3 normalized schema
✅ Threshold: 200 datasets minimum (strict by default)
✅ --allowLowCount flag turns threshold failure into warning (exit 0)

## Exit Codes
- 0: All validations passed (or warnings only with --allowLowCount)
- 1: Any validation failure (schema, counts, threshold without flag)

## CLI Interface
- `--file=path/to/directory.json` (default: municipalities/CA/SF/directory.json)
- `--domain=data.sfgov.org` (default: data.sfgov.org)
- `--allowLowCount` (turns threshold failure into warning, NOT for CI use)

## NPM Scripts Added (package.json)
- `registry:socrata:sf:build` - Build the SF index
- `registry:socrata:sf:validate` - Validate the output  
- `registry:socrata:sf:rebuild` - Combined build + validate

## CI Integration (.github/workflows/ci.yml)
✅ Added validation step after build
✅ Path filter triggers on changes to:
  - municipalities/CA/SF/directory.json
  - scripts/build-datasf-index.mjs
  - scripts/validate-datasf-index.mjs
  - __docs__/catalogs/sf-socrata-profile.md
✅ Runs WITHOUT --allowLowCount (strict mode)
✅ Fails CI on any validation error (exit code 1)

## Documentation Updates
### __docs__/catalogs/sf-socrata-profile.md
- Added "Validation & CI" section
- Documents validator responsibilities
- Explains exit codes
- Details CI integration and path filters

### README.md
- Added "Socrata Registry (SF)" section
- Links to detailed documentation
- Shows three pnpm commands
- Notes SOCRATA_APP_TOKEN is optional

## Quality Assurance
- **NodeNext ESM**: Pure .mjs with explicit imports
- **No TypeScript**: Plain JavaScript with Zod runtime validation
- **No dist/ imports**: Self-contained script
- **Deterministic**: Same input → same output → same exit code
- **CI-ready**: Clear one-line errors for CI logs
- **Strict by default**: Threshold failures block CI unless explicitly overridden