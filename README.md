# CiviCue Data Pipeline

This project implements a comprehensive data pipeline for San Francisco municipal data, facilitating the flow from CSV files and Google Sheets into a structured Postgres database with landing, staging, and core layers, followed by reverse ETL back to Google Sheets for analysis and reporting.

**Project Status: Greenfield init**

## Local DB

- Start: `docker compose up -d`
- Reset: `./scripts/resetDb.sh`
- Connect: `psql -h localhost -p 5432 -U dev -d civicue`

### Run migrations
1) Start DB (if not already): `docker compose up -d`
2) (Optional) create a `.env` using `.env.example`
3) Apply: `./scripts/migrate.sh`

### CSV → landing (evictions)
Place CSV files under `data/csv_raw/evictions/`.
- Dry run (no DB writes): `npm run run:evictions:landing`
- Write to DB (requires migrations applied): `npm run run:evictions:landing:write`

### landing → staging (evictions)
Transform landing_raw.evictions_raw into typed, deduped staging rows.
- Run (requires DB up + migrations applied): `npm run run:evictions:staging`

### staging → core (evictions)
Upsert typed staging rows into core fact table using case_number as the business key.
- Run (requires DB up + migrations applied): `npm run run:evictions:core`

## First run (evictions only)
1. Start DB: `docker compose up -d`
2. Apply schemas: `./scripts/migrate.sh`
3. Seed reference dims: `psql -h localhost -p 5432 -U dev -d civicue -f db/seeds/seed_reference.sql`
4. Load landing (dry-run): `npm run run:evictions:landing`
5. Load landing (write): `npm run run:evictions:landing:write`
6. Transform to staging: `npm run run:evictions:staging`
7. Upsert to core: `npm run run:evictions:core`
8. QA checks: `psql -h localhost -p 5432 -U dev -d civicue -f tests/data-quality/evictions_basic.sql`
