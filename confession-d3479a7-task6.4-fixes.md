# Pre-flight Checklist & Confession - Task 6.4 Fixes

## Deviations & Placeholders
- TODOs present: none
- Stubs/mocks: none
- Missing tests: none (CI workflow is the test)
- Unvalidated env reads: none
- Rate-limit/backoff gaps: none
- OpenAPI mismatch: none (no API changes)
- Performance landmines: none

## Surface & Context
Feature/Module: Task 6.4 Fixes - CI Secrets Scan Canary Workflow improvements
Related RFC/Doc: Task 6 (Implement Secrets Policy) - CI integration fixes
Scope: Explicit exit-code handling and checkout/docs alignment
Risk: low (CI workflow refinement only)

## Invariants Claimed
- OpenAPI conformance: N/A (no API changes)
- I/O timeouts: single curl with built-in timeout
- Retries/backoff: relies on GitHub Actions job retry policy
- Pagination: N/A
- Tests added: workflow IS the test (canary detection)
- correlationId logs end-to-end: N/A (CI workflow context)

## Quick Test Plan
```bash
git status --staged
pnpm -s lint && pnpm -s typecheck
# Workflow will be tested on next push/PR
```

## Rollback
- Revert workflow changes to previous || {} logic
- No runtime impact (standalone CI workflow)

# Changes Summary

## Exit-Code Handling Change
- **Before**: Used `|| { success; exit 0 }` pattern with implicit exit code handling
- **After**: Explicit exit code capture and branching:
  - Exit code 1 = canary found (SUCCESS - expected detection)
  - Exit code 0 = no leaks found (FAILURE - canary missed)
  - Exit code ≥2 = scanner error (FAILURE - tool error)

## Version Check Added
- Added `./gitleaks version` verification step before running detection
- Fails fast if gitleaks binary is corrupted or incompatible
- Provides version info in CI logs for debugging

## Chosen Approach: Simplified Checkout
- **Option**: Removed `fetch-depth: 0` from workflow checkout step
- **Documentation**: Updated to remove "full history" phrasing
- **Rationale**: Canary test only needs current workspace, faster execution
- **Alignment**: Workflow and docs now consistent (simple checkout)