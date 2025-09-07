# Pre-flight Checklist & Confession — Task 4 fixes

1) Scope Compliance: **Yes** — Only moved tsd test, corrected tsconfig include, and ensured spec scripts.
2) Files Modified:
   - `tests/types/openapi-usage.test-d.ts` (from `test-d/api-types.test-d.ts`)
   - `tsconfig.json` (include `src/generated/**/*.ts`, `tests/types/**/*.test-d.ts`)
   - `package.json` (ensure `spec:*` scripts)
3) Root Cause: ESLint TS project linting excluded `test-d/**`, causing parser failure.
4) Determinism: Typegen diff enforced; tsd is compile-only; Spectral fails on warn severity.
5) Follow-ups: Confirm `.spectral.yaml` and `.github/workflows/openapi.yml` are present (done earlier in Task 4).

**Defense Statement:** Aligns tsd location with repo conventions and TS project config; restores green `pnpm lint` without weakening lint rules.
