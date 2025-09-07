# Pre-flight Checklist & Confession

## Deviations & Placeholders
- TODOs present: none
- Stubs/mocks: none
- Missing tests: Logger serializers not unit tested (acceptable for this slice)
- Unvalidated env reads: none (uses getEnv() validation)
- Rate-limit/backoff gaps: none (not applicable to this slice)
- OpenAPI mismatch: none (no API changes)
- Performance landmines: none

## Surface & Context
Feature/Module: Task 6 Slice 1 - Secrets Policy and Centralized Logging
Related RFC/Doc: Task 6 (Implement Secrets Policy)
Scope: SECRETS.md policy, staged gitleaks scanning, pino logger with redaction
Risk: low (no existing code modifications, additive changes only)

## Invariants Claimed
- OpenAPI conformance: yes (no API changes)
- I/O timeouts: N/A (no network I/O in this slice)
- Retries/backoff: N/A (no network I/O in this slice)  
- Pagination: N/A (no pagination logic)
- Tests added: none (policy and infrastructure setup)
- correlationId logs end-to-end: no (not in scope for this slice)

## Quick Test Plan
```bash
pnpm -s lint && pnpm -s typecheck
npx tsx -e "import('./src/server/lib/logger.ts').then(m=>console.log(m.logger?'ok':'missing'))"
GITLEAKS_ALLOW=1 pnpm -s secret:staged  # should bypass
pnpm -s secret:staged  # should run gitleaks
```

## Rollback
- Remove files: SECRETS.md, src/server/lib/logger.ts, __docs__/logging/pino.md
- Revert: package.json script, .husky/pre-commit line, src/lib/env.ts logLevel addition
- No runtime impact (logger not yet integrated into codebase)

# Behavior Summary

## Scope Compliance (6.1 + 6.3 Only)
✅ Task 6.1 - Secrets policy documentation and staged-only gitleaks scanning
✅ Task 6.3 - Centralized pino logger with sensitive data redaction
❌ Task 6.2 - Server-only secrets facade (deferred to next slice)
❌ Task 6.4 - CI canary integration (deferred to next slice)
❌ Task 6.5 - ESLint enforcement rules (deferred to next slice)

## Files Changed
- **SECRETS.md** (new) - Security policy and scanning documentation
- **.gitleaks.toml** (unchanged) - Already had redaction enabled
- **package.json** - Added "secret:staged" script with GITLEAKS_ALLOW bypass
- **.husky/pre-commit** - Appended staged secret scanning
- **src/server/lib/logger.ts** (new) - Pino logger with redaction and serializers
- **__docs__/logging/pino.md** (new) - Logger usage documentation
- **src/lib/env.ts** - Added runtime.logLevel field to schema

## Behavioral Changes
1. **Staged-only gitleaks scanning**: Pre-commit hooks now scan staged files for secrets using `gitleaks detect --staged --redact -v`
2. **Emergency bypass**: `GITLEAKS_ALLOW=1` environment variable bypasses secret scanning
3. **Pino logger available**: Centralized logger with automatic redaction of sensitive headers/fields
4. **Environment validation**: LOG_LEVEL now validated through getEnv() with default 'info'

## Follow-ups (Next Slices)
- **6.4**: CI secret scanning with temp-file canary test
- **6.2**: Server-only secrets facade to replace direct getEnv() calls
- **6.5**: ESLint restrictions to enforce secrets facade usage after implementation