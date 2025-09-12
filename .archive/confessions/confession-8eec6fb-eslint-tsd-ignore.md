# Confession — ESLint + tsd boundary
- Scope: Add `tests/types/**/*.test-d.ts` to `eslint.config.mjs` ignores array
- Rationale: tsd owns compile-time negative tests; ESLint's TS project parser shouldn't load them
- Idempotent: No functional code changed; CI still runs `spec:tsd`
- Verification: `pnpm typecheck`, `pnpm lint`, and `pnpm spec:tsd` all pass
