# Architecture Overview

This repo maintains discoverable dataset registries (Socrata, CKAN, ArcGIS) and a loader to persist them in Postgres for downstream ingestion/vectorization.

- Discovery builders: `scripts/build-*-index.mjs` (Socrata/CKAN/ArcGIS)
- Merge: `scripts/merge-registries.mjs` → `registries/socrata.json`
- Registry DB: `scripts/registry-to-pg.mjs` → `registry.socrata_assets`
- Activation: `municipalities/<STATE>/<CITY>/activation.json` controls enabled feeds and cadence.

Railway app notes
- API code is intentionally untouched here; this layer focuses on catalogs. Share `/www/archdoc` or a summary to align interfaces.
