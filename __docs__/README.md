# Documentation Index

- Platform Keys & Tokens: `__docs__/platform-keys.md`
- Architecture Overview: `__docs__/architecture/README.md`
- Catalog Profiles: `__docs__/catalogs/README.md`

Notes
- Per‑city dataset registries live under `municipalities/<STATE>/<CITY>/` and merge into `registries/socrata.json`.
- Builder scripts live in `scripts/` (Socrata, CKAN, ArcGIS) and are hash‑aware to avoid churn.
- For ingestion/vectorization, use activation files (e.g., `municipalities/CA/SF/activation.json`) to toggle feeds and cadence.
