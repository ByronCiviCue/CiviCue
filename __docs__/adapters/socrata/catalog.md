# Socrata Catalog Ingest

This document describes the process for ingesting the global Socrata catalog into the local database.

## Schema

The ingest process populates the following tables:

- `socrata_hosts`: Stores information about Socrata hosts, including their region.
- `socrata_domains`: Stores information about Socrata domains, including their country and region.
- `socrata_agencies`: Stores information about agencies associated with a Socrata host.

The SQL schema can be found in `__docs__/migrations/socrata-catalog.sql`.

## Ingest CLI

The catalog can be ingested using the `bin/socrata-catalog.ts` script.

**Usage:**

```bash
./bin/socrata-catalog.ts [options]
```

**Options:**

- `--regions=US,EU`: Comma-separated list of regions to ingest (default: US,EU).
- `--host=<hostname>`: Filter to a specific host.
- `--limit=<number>`: Maximum number of domains to fetch per region.
- `--dry-run`: Run the ingest process without writing to the database.

**Note:** The `DATABASE_URL` environment variable must be set unless running with `--dry-run`.

**CI Note:** This script is not intended to be run in a CI environment and will exit if `process.env.CI` is set.

## Smoke Test

A smoke test script is available to verify that the client stack can query a dataset.

**Usage:**

```bash
./bin/socrata-smoke.ts --host=<hostname> --dataset=<resource-id> --allow-live
```

**Note:** This script performs live API requests and must be run with the `--allow-live` flag.
## Local registry creation

For local development, you can apply the Socrata catalog SQL to your Postgres instance:

```
node bin/db-apply-sql.mjs --file __docs__/migrations/socrata-catalog.sql
```

Notes:
- Local-only; not used in CI.
- Requires `DATABASE_URL`.
