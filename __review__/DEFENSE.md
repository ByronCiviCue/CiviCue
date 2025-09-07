# Defense Statement - Vitest Workspace Deprecation Fix

## Objective
Eliminate Vitest workspace deprecation warnings by migrating from standalone `vitest.workspace.ts` file to `test.projects` configuration within `vitest.config.ts`, ensuring compatibility with Vitest 3.2.4 API.

## Design Choices

### Migration Strategy: In-Place Config Consolidation
**Pattern:** Single config file with named projects instead of separate workspace file
**Alternative rejected:** Upgrading to newer Vitest version that might support different API
**Rationale:** Maintain current Vitest version while eliminating deprecation warnings through supported API migration

### Temporary Include Patterns for Legacy Tests
**Pattern:** TEMP includes for root-level tests until Commit B relocates them
**Alternative rejected:** Moving tests immediately in this commit
**Rationale:** Atomic commits - this spike handles only deprecation elimination, file relocation is separate concern

### Script Simplification
**Pattern:** Remove `--workspace` flag, keep `--project` targeting
**Alternative rejected:** Keeping workspace file and ignoring deprecation
**Rationale:** Clean migration eliminates warnings and uses official API

## Performance
**Volumes:** Small test suite, minimal performance impact
**Big-O:** No algorithmic changes, same test execution patterns
**Rate-limits:** N/A (local test execution)
**Memory bounds:** Same isolation as previous workspace (threads vs forks per project)

## Correctness & Compatibility

### API Structure Compliance
- Uses `test: { projects: [...] }` structure required by Vitest 3.2.4
- Preserves identical timeout, pool, and coverage settings per project
- Maintains exact include/exclude patterns from original workspace

### Script Command Compatibility  
- Scripts now use `--project <name>` without `--workspace` flag
- Verified working with `pnpm test:unit` (8 tests pass)
- Empty projects correctly report "No test files found" as expected

## Test Strategy

### Infrastructure Verification
- **Unit:** TypeScript compilation passes, unit tests execute successfully
- **Golden:** Test output format unchanged (same reporter, same isolation)
- **Contract:** Each project maintains distinct configuration (timeouts, pools)
- **Load:** N/A (test infrastructure change)

### Existing Test Preservation
- `tests/env.spec.ts` remains runnable via unit project TEMP include
- `tests/eslint-rules-verification.test.ts` remains runnable via arch project TEMP include
- No test behavior changes, only execution pathway migration

## Security
- **Secrets:** N/A (test configuration only)
- **Redaction:** N/A (no sensitive data handling)

## Operational Plan

### Metrics & Logs
- No new logging required for config migration
- Test execution logs unchanged (same Vitest reporter)

### Rollout/Rollback
**Rollout:** Immediate (staging protocol - no commit until reviewed)
**Rollback:** `git checkout -- vitest.config.ts && git restore vitest.workspace.ts` + revert package.json scripts
**Verification:** `pnpm test` should run without deprecation warnings

### Dependencies
- No external service dependencies
- Compatible with existing CI/build pipelines 
- Node.js/pnpm execution environment unchanged