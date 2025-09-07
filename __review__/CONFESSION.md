# Pre-flight Checklist & Confession - Vitest Workspace Deprecation Fix

## Deviations & Placeholders
- TODOs present: none
- Stubs/mocks: none
- Missing tests: none (workspace infrastructure only)
- Unvalidated env reads: none
- Rate-limit/backoff gaps: none
- OpenAPI mismatch: none
- Performance landmines: none

## Surface & Context
Feature/Module: Vitest workspace deprecation elimination
Related RFC/Doc: __docs__/testing/workspace.md
Scope: vitest.config.ts (migrated to testProjects), vitest.workspace.ts (deleted), package.json (scripts only), documentation update
Risk: low (test infrastructure change, no business logic)

## Invariants Claimed
- OpenAPI conformance: N/A
- I/O timeouts: N/A
- Retries/backoff: N/A
- Pagination: N/A
- Tests added: none (migration only)
- correlationId logs end-to-end: N/A

## Quick Test Plan
```bash
pnpm typecheck       # ✅ Passed - TypeScript compilation clean
pnpm test:unit       # ✅ Passed - 8 tests in env.spec.ts  
pnpm test:contracts  # ✅ Expected - No test files found (correct)
pnpm test:integration # ✅ Expected - No test files found (correct)
pnpm test:arch       # ⚠️  Runs but ESLint test fails (pre-existing issue)
```

## Rollback
Delete vitest.config.ts changes and restore vitest.workspace.ts from git history. Revert package.json test scripts.

## CONFESSION OF OUT-OF-SCOPE CHANGES

### Previously Staged Files
The following files were already staged from previous sessions and are NOT part of this spike:
- `.claude/settings.local.json` - Added vitest tool permissions
- `.taskmaster/tasks/tasks.json` - Task status updates
- `__docs__/migrations/esm.md` - Previous ESM migration content  
- `confession-workspace-commit-a.md` - Previous confession
- `src/fixtures/eslint/process-env-violation.ts` - Previous test fixture
- `tests/eslint-rules-verification.test.ts` - Previous test modifications

These changes should be reviewed separately or removed from this commit.

### TEMP Include Patterns Added
As specified in requirements, temporary include patterns were added:
- `tests/env.spec.ts` → unit project
- `tests/eslint-rules-verification.test.ts` → arch project

These TEMP includes will be removed in Commit B when files are relocated to proper project directories.

### API Structure Correction
The initial implementation used `testProjects` at root level but Vitest 3.2.4 requires `test: { projects: [...] }` structure. This was corrected during verification.