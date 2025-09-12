# Confession (TM-MAINT)

> Note: Previous iterations referenced 62.8; this confession is now tracked under TM-MAINT (Taskmaster maintenance).

Added catalog.socrata_municipality_index migration.

Introduced Kysely DB bootstrap with pg.

Added socrata-counts CLI: US/EU discovery → per-host agency counts.

No unrelated files modified. No axios. Uses native fetch.

Implemented Option A: added secrets.isCI() and migrated CLI to use it.

Added secrets.getSocrataAppToken() to avoid direct env reads in bin/.

Kept diffs surgical; no changes to other bin scripts.

Package passes lint for touched files; no behavior change beyond CI guard/token source.

Added cross-tag dependency ledger and idempotent doc injector.

Injected single-line header references across .taskmaster; no code touched.

Did not modify Taskmaster internals or tasks.json.

Operation is idempotent; re-running causes no duplicates.

Added cross-tag dependency ledger + idempotent injector; injected headers.

Added Socrata discovery CLI and catalog migration; no behavior changes to adapter.

No Taskmaster internals modified; package.json minimal script/deps only.

No commits; ready for review.

Fixed ESLint project coverage for CLI; no rule disables.

Corrected secrets usage in Kysely to use getDatabaseUrl().

Kept ESM NodeNext; no runtime changes.

No Taskmaster/tests touched.

Hardened CLI arg parsing: whitelist + zod validation + pollution-safe minimist config.

Removed all security/detect-object-injection warnings without suppressions.

No behavioral changes beyond validated arg parsing.

2025-01-10T20:14:45.000Z

Taskmaster planning pass finalized:
- Populated 43 in-tag dependency edges across all tags for logical ordering
- Created .txt file injector for ledger pointers (135 files modified) 
- Fixed dependency validator to check both dependencies and meta.depends_on arrays
- Regenerated comprehensive audit: 8 cross-tag + 384 total dependency tasks
- All task docs now include "Cross-tag dependencies: see .taskmaster/dependencies.md"
- No Taskmaster internals modified; staging includes only tasks.json, docs, and utilities
2025-09-11T20:06:45.000Z

Filename normalized to: confession-a44e77e-TM-MAINT.md
2025-09-11T20:07:30.000Z