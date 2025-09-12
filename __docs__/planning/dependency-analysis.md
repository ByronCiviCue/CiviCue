# In-Tag Dependency Analysis
**Date:** 2025-09-11  
**Scope:** Minimal in-tag dependency chains for TaskMaster sequencing  
**Tags Processed:** Database, API, Vector, Admin, Infra  

## Database Tag

### Before
```
ID | Dependencies | Title
65 | None         | Socrata global directory database schema and migration
66 | None         | Socrata catalog ingestion service with rate limiting
67 | None         | Finalize schema design and decisions
68 | None         | Create schema and required extensions
69 | None         | Add down migration and run end-to-end verification
28 | None         | Implement ingest job (jobs/ingest-branch.ts)
30 | None         | Enforce embedding model and dimension guard
70 | None         | Add ingest job freshness widgets
26 | None         | Vector strategy decision document
64 | None         | Vectorization strategy and ingestion shaping
71 | None         | DB.5 – JSONL Materializer: artifacts → staging tables
72 | None         | DB.6 – Materialize staging → normalized civic.* tables
```

### After
```
ID | Dependencies | Title
65 | None         | Socrata global directory database schema and migration
66 | [65]         | Socrata catalog ingestion service with rate limiting
67 | None         | Finalize schema design and decisions
68 | [67]         | Create schema and required extensions
69 | [68]         | Add down migration and run end-to-end verification
28 | [69]         | Implement ingest job (jobs/ingest-branch.ts)
30 | [26]         | Enforce embedding model and dimension guard
70 | [28]         | Add ingest job freshness widgets
26 | None         | Vector strategy decision document
64 | [26]         | Vectorization strategy and ingestion shaping
71 | [69]         | DB.5 – JSONL Materializer: artifacts → staging tables
72 | [71]         | DB.6 – Materialize staging → normalized civic.* tables
```

**Chains Created:**
- Schema chain: 67 → 68 → 69 → (71, 28)
- Materializer chain: 69 → 71 → 72
- Ingest chain: 69 → 28 → 70
- Socrata catalog chain: 65 → 66
- Vector strategy chain: 26 → (64, 30)

## API Tag

### Before
```
ID | Dependencies | Title
22 | None         | Implement /v1/health route
42 | [41,38]      | Adopt Socrata type-extraction outputs
43 | [41,39]      | Adopt CKAN type-extraction outputs
44 | [41,40]      | Adopt ArcGIS type-extraction outputs
45 | [41,42,43,44]| Wire typegen pipeline
46 | [5]          | Pre-commit: Block direct edits under src/generated/**
47 | [2]          | Typegen: Fetch provider schemas
48 | [47]         | Typegen: compute fingerprints
49 | [47,48]      | Typegen: Generate TS types + Zod schemas
50 | [49]         | Typegen: compatibility check
51 | [50]         | CI: Add typegen check job
52 | [5,46]       | Pre-commit: Block edits to src/generated/**
53 | [50,51,52]   | Docs: Approving Type Drift
66 | None         | Cross-provider schema drift survey
67 | None         | Branched client consolidation and interfaces
```

### After
```
ID | Dependencies | Title
22 | None         | Implement /v1/health route
42 | [41,38]      | Adopt Socrata type-extraction outputs
43 | [41,39]      | Adopt CKAN type-extraction outputs
44 | [41,40]      | Adopt ArcGIS type-extraction outputs
45 | [41,42,43,44]| Wire typegen pipeline
46 | [5]          | Pre-commit: Block direct edits under src/generated/**
47 | [2]          | Typegen: Fetch provider schemas
48 | [47]         | Typegen: compute fingerprints
49 | [47,48]      | Typegen: Generate TS types + Zod schemas
50 | [49]         | Typegen: compatibility check
51 | [50]         | CI: Add typegen check job
52 | [5,46]       | Pre-commit: Block edits to src/generated/**
53 | [50,51,52]   | Docs: Approving Type Drift
66 | None         | Cross-provider schema drift survey
67 | [66]         | Branched client consolidation and interfaces
```

**Changes:**
- Added 67 → 66 (client consolidation depends on drift survey)
- Most API tasks already had proper dependencies from previous work

**Note:** Task 22 (/v1/health route) is standalone and doesn't require dependencies.

## Vector Tag

### Before
```
ID | Dependencies | Title
1  | None         | VEC.1 – Pilot embeddings on catalog metadata
2  | None         | VEC.2 – Hybrid query planner (lexical + embedding)
3  | None         | VEC.3 – Flashpoint presentation: benefits of unified civic search
```

### After
```
ID | Dependencies | Title
1  | None         | VEC.1 – Pilot embeddings on catalog metadata
2  | [1]          | VEC.2 – Hybrid query planner (lexical + embedding)
3  | [2]          | VEC.3 – Flashpoint presentation: benefits of unified civic search
```

**Chain Created:**
- Vector progression: 1 → 2 → 3

## Admin Tag

### Before
```
ID | Dependencies | Title
1  | None         | ADM.1 – Catalog dashboard
2  | None         | ADM.2 – Runbook docs
3  | None         | ADM.3 – Metrics + alerting baseline
```

### After
```
ID | Dependencies | Title
1  | [3]          | ADM.1 – Catalog dashboard
2  | None         | ADM.2 – Runbook docs
3  | None         | ADM.3 – Metrics + alerting baseline
```

**Changes:**
- Dashboard (1) now depends on metrics (3) being available
- Runbook docs (2) remains standalone

## Infra Tag

### Before
```
ID | Dependencies | Title
1  | None         | INFRA.1 – Lint/ESLint v9 adoption
2  | None         | INFRA.2 – Env standardization (local, CI, deploy)
3  | None         | INFRA.3 – CI/CD setup
```

### After
```
ID | Dependencies | Title
1  | None         | INFRA.1 – Lint/ESLint v9 adoption
2  | None         | INFRA.2 – Env standardization (local, CI, deploy)
3  | [1]          | INFRA.3 – CI/CD setup
```

**Changes:**
- CI/CD (3) now depends on lint setup (1)
- Env standardization (2) remains independent

## Summary

**Tags Processed:** Database, API, Vector, Admin, Infra  
**Tasks Updated:** 14 tasks given new dependencies  
**Out-of-band tasks:** None identified - all tasks properly belong to their tags  

**Note:** Cross-tag dependencies remain in `.taskmaster/dependencies.md` and were not modified in this pass. This analysis focused only on establishing minimal in-tag chains for proper sequencing within each feature silo.