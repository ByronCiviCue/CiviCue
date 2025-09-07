#!/usr/bin/env bash
set -euo pipefail

# This script seeds Task Master with tags and high-level tasks containing rich context.
# It does not set dependencies automatically (IDs are dynamic). Use `tm show` to get IDs
# and wire them with `tm add-dependency` after creation.

cmd_exists() { command -v "$1" >/dev/null 2>&1; }
if ! cmd_exists tm && ! cmd_exists task-master; then
  echo "Task Master CLI not found (tm/task-master). Install before running." >&2
  exit 1
fi

TM=tm
cmd_exists tm || TM=task-master

echo "Creating tags..."
$TM add-tag adapters || true
$TM add-tag registries || true
$TM add-tag vector || true
$TM add-tag branch-engine || true
$TM add-tag api || true
$TM add-tag database || true
$TM add-tag ci || true
$TM add-tag observability || true
$TM add-tag scale || true

echo "Adding tasks..."

$TM use-tag registries
$TM add-task --priority=highest --prompt "Pilot kickoff: Build SF city index from Socrata and profile API shapes. Context: Use existing registry builder to fetch the full DataSF catalog with SOCRATA_APP_ID. Produce a profile at __docs__/catalogs/sf-socrata-profile.md summarizing: dataset count, categories, common column names/types, paging/limits, auth needs, and shortlist the 5–7 pilot datasets. Deliverables: refreshed municipalities/CA/SF/directory.json, profile doc, open questions noted." || true

$TM add-task --priority=high --prompt "Detroit discovery (optional parallel): Build Detroit city index from Socrata and compare shapes with SF. Context: Run Detroit registry, generate __docs__/catalogs/detroit-socrata-profile.md with the same summary structure, then produce a delta section versus SF (fields, schema patterns, auth). Deliverables: refreshed municipalities/MI/Detroit/directory.json, profile doc, delta vs SF." || true
$TM add-task --priority=high --prompt "Phase 1: Registry builders and merge. Context: Implement and schedule Socrata/CKAN/ArcGIS builders that emit a common CatalogItem shape {id,name,description,domain,permalink,resourceUrl,category,tags,source}. Ensure hash-aware writes and add nightly merge into registries/socrata.json including directory*.json per city. Deliverables: working builders, README/AGENTS updates, .env keys, merge script, sample outputs for SF and Detroit." || true

$TM add-task --priority=high --prompt "Postgres loader for registries. Context: Create registry schema (registry.sources, registry.assets, registry.branches or single socrata_assets extended with source field). Upsert on content hash change only; log counts and snapshot id. Deliverables: loader script, schema migration, docs." || true

$TM use-tag adapters
$TM add-task --priority=high --prompt "Metadata normalization mapping. Context: From SF Socrata profiles, draft canonical field mappings per domain (e.g., permits, evictions, 311) into BranchItem shape (ids, title, address, dates, status, geo, provenance). Capture required transforms (date parsing, address normalization, enums). Deliverables: __docs__/catalogs/normalization-map.md with per-dataset mapping tables and open gaps." || true
$TM add-task --priority=high --prompt "Define universal DataPortal interface and types (CatalogItem, Query) with native 'where' pass-through. Context: keep adapters thin and map select/order/limit/offset to backend dialects (SoQL, CKAN datastore, ArcGIS FeatureServer). Deliverables: types + adapters.md." || true

$TM add-task --priority=high --prompt "Socrata adapter: Discovery API + SoQL rows. Context: headers with X-App-Token; map select->$select, where->$where, orderBy->$order, limit/offset. Include retry/backoff fetchJson. Deliverables: adapter module + unit smoke tests against public datasets." || true

$TM add-task --priority=medium --prompt "CKAN adapter: package_search + datastore_search. Context: optional X-CKAN-API-Key; map select to fields when possible, sort, limit/offset; return records[]; unwrap to plain objects. Deliverables: adapter module + smoke tests." || true

$TM add-task --priority=medium --prompt "ArcGIS adapter: Hub catalog + FeatureServer query. Context: API key or OAuth client credentials; where/outFields/orderByFields/resultOffset/resultRecordCount; unwrap features[].attributes. Deliverables: adapter module + smoke tests." || true

$TM use-tag branch-engine
$TM add-task --priority=high --prompt "Shape survey & pilot scope selection. Context: Review SF profile and normalization map to pick the first branch (sf.housing.permits) and define plan/fuse inputs/outputs. Document dedupe keys and freshness scoring. Deliverables: design notes in __docs__/catalogs/branch-sf-housing-permits.md; update activation.json." || true
$TM add-task --priority=high --prompt "Branch Engine: define Branch interface (plan/run/fuse) and executeBranch(). Context: concurrent fetch across sources, fuse with dedupe keys and scoring, provenance stamping. Deliverables: types, engine, tests." || true

$TM add-task --priority=high --prompt "First branch: sf.housing.permits. Context: pick 2+ sources (Socrata + ArcGIS or CKAN), implement plan/fuse with golden-file tests for dedupe/score. Deliverables: runnable branch, activation entry." || true

$TM use-tag api
$TM add-task --priority=medium --prompt "OpenAPI contract and TS types. Context: finalize openapi.yaml; generate TS types + Postman collection; add OpenAPI validator to CI. Deliverables: openapi.yaml, generated clients." || true

$TM add-task --priority=high --prompt "API routes: /v1/health, /v1/search/hybrid, /v1/reports/permits. Context: thin controllers over Branch Engine; RFC 7807 errors; pagination. Deliverables: route handlers + tests." || true

$TM use-tag database
$TM add-task --priority=high --prompt "Vector strategy decision: per-city vs global index. Context: Evaluate pros/cons: tenancy isolation, relevancy, cross-city search, operational simplicity, embedding reuse. Recommend approach (e.g., single tables with city/branch_id partitioning or separate schemas per city). Deliverables: decision record __docs__/architecture/vector-strategy.md with rationale and migration guardrails." || true

$TM add-task --priority=medium --prompt "Vector schema pilot (SF). Context: Implement chosen strategy for the pilot: create core.items and core.item_embeddings keyed by branch_id + id with city/jurisdiction metadata. Ensure namespace isolation supports future Detroit without schema changes. Deliverables: SQL DDL, notes in vector-strategy.md." || true
$TM add-task --priority=high --prompt "pgvector schema + upsert pipeline. Context: core.items (normalized), core.item_embeddings (VECTOR with IVFFLAT). Job jobs/ingest-branch.ts reads activation, upserts items, embeds changes. Deliverables: SQL, job, embedders." || true

$TM use-tag ci
$TM add-task --priority=medium --prompt "Registry scan CI: nightly SF scan, compare hash, open PR with profile diffs. Context: After running registry:merge, regenerate __docs__/catalogs/sf-socrata-profile.md if changes are detected, and attach a summary to the PR. Deliverables: workflow yaml + small script to compute profile deltas." || true
$TM add-task --priority=medium --prompt "CI: nightly registry refresh + PR on hash change; hourly ingest for active branches; unit/golden tests; OpenAPI lint. Deliverables: GitHub Actions workflows." || true

$TM use-tag observability
$TM add-task --priority=low --prompt "Observability: metrics (latency, counts, dedupe, vectorized), logs with correlationId, dashboards for freshness SLO (<6h), API latency, error budgets. Deliverables: metrics wiring + dashboard notes." || true

$TM use-tag scale
$TM add-task --priority=low --prompt "Scale-Out Playbook: naming (jurisdiction.domain.topic), codegen field mappings from discovery metadata, lint rules for branches, governance (dedupe keys, source weighting), activation cadence. Deliverables: docs + checks." || true

echo "Done. Use 'tm list --with-subtasks' and 'tm show <id>' to review. Wire dependencies with 'tm add-dependency'."
