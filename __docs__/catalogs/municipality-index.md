# Socrata Municipality Index (Catalog)

Purpose: Persist per-host (domain) counts discovered from Socrata Discovery, for lightweight reporting and activation.

## Schema
- Schema: `catalog`
- Table: `catalog.socrata_municipality_index`
  - `host text PRIMARY KEY`
  - `domain text NOT NULL`
  - `region text NOT NULL` (e.g., `US`, `EU`)
  - `country text NULL`
  - `city text NULL`
  - `agency_count int NOT NULL DEFAULT 0`
  - `dataset_count int NOT NULL DEFAULT 0`
  - `last_seen timestamptz NOT NULL DEFAULT now()`
  - `source text NOT NULL DEFAULT 'socrata'`
  - `meta jsonb NULL`

## How to Run

1) Create/Update the table
```
pnpm db:migrate:catalog
```

2) Dry run the discovery counts (no DB writes)
```
pnpm socrata:counts --dry-run
```

3) Upsert counts and print report
```
pnpm socrata:counts
```

### Flags
- `--regions=US,EU` (default)
- `--limit=<n>` (optional)
- `--page-size=<n>` (default 500)
- `--dry-run` (no DB writes)
- `--verbose` (progress to stderr)

## Environment
- Requires `DATABASE_URL` (for Kysely/pg pool)
- Socrata token (optional, recommended): `SOCRATA_APP_TOKEN` or host override `SOCRATA__api.us.socrata.com__APP_TOKEN`
- CLI refuses to run in CI

Notes:
- Uses native `fetch` (no axios)
- Uses Kysely + pg for DB access
- ESM / NodeNext compatible
