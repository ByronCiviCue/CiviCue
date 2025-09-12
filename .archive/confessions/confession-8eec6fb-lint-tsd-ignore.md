# Confession — ESLint + tsd boundary
- Scope: Add `.eslintignore` entry for `tests/types/**/*.test-d.ts`
- Rationale: tsd owns compile-time negative tests; ESLint's TS project parser shouldn't load them.
- Idempotent: No functional code changed; CI still runs `spec:tsd`.
