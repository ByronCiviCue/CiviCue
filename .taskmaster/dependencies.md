# Cross-Tag Dependency Ledger

> **Cross-tag dependencies:** see `.taskmaster/dependencies.md`.

This ledger declares dependencies Taskmaster cannot enforce across tags.
Each line is a tuple: <FROM_TASK> -> <REQUIRES> with optional rationale.

## Legend
- Task IDs are <TAG>.<NUM> (e.g., API.62, Database.64, Database.69, Admin.3, Infra.2)
- "REQUIRES" lists one or more prerequisites across tags
- Keep entries alphabetized by FROM_TASK

## Ledger
- Admin.1 (Dashboards) -> API.62, Database.67, Database.69 | Observability depends on data flow
- Admin.3 (Operational metrics) -> API.62 | Emit metrics from IO policy
- API.23 (Hybrid search endpoint) -> Database.69 | Requires vector store & policy
- API.38 (Typegen: fetch stage) -> API.62 | Adapter contracts precede typegen usage
- API.39 (Typegen: fingerprints) -> API.62 | Adapter contracts precede typegen usage  
- API.40 (Typegen: generation) -> API.62 | Adapter contracts precede typegen usage
- API.41 (Typegen: promotion) -> API.62 | Adapter contracts precede typegen usage
- Database.66 (Catalog ingestion service) -> Database.65 | Service needs schema migration first
- Database.67 (Core schema registry) -> API.62 | Ingest writes rely on adapter contracts
- Database.69 (Municipality registry + embeddings tables) -> Database.67, Database.68 | Schema and extensions first
- Database.71 (JSONL Materializer) -> Database.70 | Materializer after freshness widgets
- Database.72 (Staging normalizer) -> Database.71 | Normalize after staging setup
- Infra.3 (CI: typecheck/lint/tests/contract) -> API.62, App.1 | CI runs after adapter baselines

## Inferred (confirmed from task analysis)
- API.29 (Embedding computation) -> Database.67 | Embedding jobs need core schema
- API.65 (Vectorization rules) -> Database.26 | Rules need vector strategy
- Database.67 (Core schema) -> API.62 | Schema design needs adapter contracts

## Update Rules
- Add new lines whenever tasks cross tags
- Keep rationales short and factual
- Update this file in the same PR as the task changes