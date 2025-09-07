# API + Branch + Vector Ingest Build Plan

## Vision
- Stable API routes via OpenAPI, exposing rollups (`/reports`) and blended search (`/search`).
- Branch clients: pluggable adapters (Socrata, CKAN, ArcGIS) normalize municipal data into one shape.
- Vector pipeline: branches feed pgvector with embeddings + metadata for unified semantic search.

## Phase 0 — Foundations
- Finalize `openapi.yaml`; generate Postman and TS types.
- Expand `.env.example` with Socrata, CKAN, ArcGIS, Postgres, embedding model.
- Create `/api/lib/`: `types.ts` (BranchQuery, BranchItem, CatalogItem, Meta, Problem), `fetchJson.ts` (retry/backoff, provenance), `normalize.ts` (address/date canonicalization, dedupe keys, freshness scoring).
- Unit test harness + CI (eslint, OpenAPI validator).
 - Pilot prep: Build SF Socrata city index and profile API shapes before vector schema decisions (see `__docs__/catalogs/sf-socrata-profile.md`).

## Phase 1 — Registry + Adapters
- Builder scripts: Socrata, CKAN, ArcGIS; nightly merge → `registries/{socrata,ckan,arcgis}.json`.
- Loader → Postgres tables: `registry.sources`, `registry.assets`, `registry.branches`.
- Core adapters: Socrata (SoQL), CKAN (datastore_search), ArcGIS (FeatureServer).
- Activation config: `municipalities/<STATE>/<CITY>/activation.json`.

## Phase 2 — Branch Engine
- Define Branch interface (plan/run/fuse) and `executeBranch()`.
- First branch: `sf.housing.permits` with 2+ sources; golden-file tests for dedupe + scoring.
- Generator: `pnpm gen:branch <jurisdiction.topic>` scaffolds plan/fuse/tests.

## Phase 3 — API Routes
- `/v1/health` (uptime); `/v1/search/hybrid` (q, department, page, limit) → branch engine; `/v1/reports/permits` (geo, from, to, status) → permits branch.
- Errors: RFC 7807 Problem.

## Phase 4 — Database + pgvector
- Schema: `core.items`, `core.item_embeddings` (IVFFLAT index).
- Job: `jobs/ingest-branch.ts` reads activation, runs branch, upserts items, embeds changes.
 - Open question: Per-city vectors vs global index; record the decision in `__docs__/architecture/vector-strategy.md` and reflect in schema.

## Phase 5 — CI/CD + Scheduling
- CI: OpenAPI lint + breaking-change check; unit + golden tests.
- Nightly: refresh registries, open PR on hash change. Hourly: run active branches; manual backfill.
- Deploy API (Railway) and worker dyno for jobs.

## Phase 6 — Observability
- Metrics: fetch latency, rows fetched/deduped, error rate, vectorized count.
- Logs: correlationId across adapters/registry/DB.
- Dashboards: freshness SLO (<6h lag), API latency, error budgets per branch.

## Phase 7 — Scale-Out Playbook
- Naming: `jurisdiction.domain.topic` (e.g., `sf.housing.permits`).
- Registry-driven branches; codegen field mappings from Socrata views/CKAN resource_show.
- Lint: branches must export plan/fuse + golden tests.
- Governance: dedupe keys, source weighting, activation cadence (nightly/hourly/realtime).

## Milestones
- M1: Socrata adapter + `sf.housing.permits` branch working.
- M2: CKAN + ArcGIS integrated.
- M3: Items + embeddings in pgvector; search demo.
- M4: CI green; nightly registry PRs; hourly ingest.
- M5: Docs + dashboards; add new branches via config only.
