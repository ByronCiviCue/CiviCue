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

### Planning
See the project planning canvas at [docs/PLANNING.md](docs/PLANNING.md).
=======
# CiviCue

Evidence-based local accountability in under 90 seconds.

CiviCue helps residents, journalists, and advocates see what is broken, why it matters, and who is responsible in their district. No endless PDFs. No guesswork. Clear accountability.

## Why this matters

Local government feels confusing. Many people do not know their supervisor or council member. Meeting minutes sit in PDFs. Votes lack context. The why behind outcomes often lives inside committees.

CiviCue addresses this directionality problem with flashpoints - evidence-backed signposts that trigger only when promises, votes, and outcomes do not align.

## Current status, September 2025

### What is built

- Supervisor voting records, 2018 to 2025, normalized into one schema
- Supervisor to district mappings
- JSON pipelines archiving local datasets
- Crime incidents
- 311 service calls
- Evictions
- Housing pipeline and completions
- Committee meetings, minutes under tabulation

### What is drafted

- Flashpoint rules engine with three tiers
- Tier 1: legislative behavior, votes, absences, delays
- Tier 2: platform contradictions, campaign versus action
- Tier 3: district outcomes, crime spikes, eviction surges, housing failures
- Golden test cases, for example Engardio housing contradictions, ready for validation

## Tech stack

- **Backend**: Python for ETL and scrapers, PostgreSQL for schema, Google Apps Script for scheduled imports
- **Storage**: Google Drive JSON exports, S3-compatible object storage planned
- **Frontend**: React and D3 visualizations planned
- **Integrity**: SHA-256 hashing of source documents, immutable evidence storage

## How to help

We welcome contributions of all sizes. Current needs:

### Data and scraping

- Parse and normalize committee minutes PDFs into structured JSON
- Clean and dedupe large JSON archives: crime, 311, evictions

### UX and frontend

- Prototype district dashboards in React and D3
- Design flows for fast clarity for residents and deeper paths for power users

### Data modeling

- Expand flashpoint rules
- Validate golden tests on live SF and Detroit data

## Getting started

Clone the repository and install dependencies:

```bash
git clone https://github.com/civicue/civicue.git
cd civicue
pip install -r requirements.txt
```

Load the schema:

```bash
psql -f schema.sql
```

Run a sample ETL:

```bash
python etl_pipeline.py
```

## Good first issues

- Parser for a sample committee minutes PDF to JSON
- React component for a 90-second flashpoint view
- Validate the Engardio housing contradiction test case
- Normalization script for eviction dataset JSONs

## Principles

- **Nonpartisan**: no labels, no endorsements
- **Evidence-based**: multiple independent receipts per flashpoint
- **Transparent**: all sources hashed and verifiable
- **Usable**: residents reach clarity in 90 seconds, power users go deeper

## Repo skeleton

```
civicue/
├── README.md
├── schema.sql
├── requirements.txt
├── .env.example
├── server/
│   ├── api.py
│   ├── etl_pipeline.py
│   ├── detect_flashpoints.py
│   ├── storage_config.yaml
│   └── flashpoint_rules.yaml
├── tests/
│   └── test_golden_cases.py
├── datasets/
│   └── samples/
│       ├── committee_minutes_sample.pdf
│       ├── votes_sample.json
│       └── evictions_sample.json
├── docs/
│   ├── methodology.txt
│   └── governance.txt
└── .github/
    ├── ISSUE_TEMPLATE/
    │   ├── module_task.md
    │   └── good_first_issue.md
    ├── pull_request_template.md
    └── workflows/
        └── ci.yml
```

## Contact

**Project lead**: Byron Eppler  
**Slack**: Beppler on SF CivicTech 
**Email**: byron@civicue.io