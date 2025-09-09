Created a durable Postgres-backed catalog of Socrata hosts/domains/agencies.
Added a manual smoke script to verify SF dataset queries.
CI has no network access; tests use cassettes.
Added PG-backed Socrata catalog (hosts/domains/agencies) with idempotent migration
Ingest job with pagination/backoff and regional resolver
Manual CLIs (catalog ingest, smoke) guarded for CI
Cassette/mocked tests; no network in CI
No config/env changes

Fixed TS ‘vi’ namespace by using explicit vitest imports and types; no tsconfig changes.
Replaced console calls with verbose writer to satisfy no-console.
No behavioral changes; tests pass locally.

Tests mock global fetch correctly; no real network
All catalog tests pass (4/4); proper Response objects with headers
Added local SQL apply CLI (manual only); no changes to SQL
No config/env changes
Drift audit: restored eslint.config.mjs, tsconfig.json, and .taskmaster to HEAD if modified.
Staged ONLY intended 62.9 files (ingest, tests, fixtures, docs, migration, local DB apply CLI).
Validation: lint/typecheck/tests pass.
No behavioral changes outside catalog ingest; no CI network; tests use mocks.
Converted local SQL apply CLI to ESM JS to avoid TS parser project errors; no config changes.
Updated docs; added global unstub cleanup in catalog tests.
Lint/typecheck/tests pass.
