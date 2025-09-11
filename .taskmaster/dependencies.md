# Cross-Tag Dependency Ledger

> **Cross-tag dependencies:** see `.taskmaster/dependencies.md`.

This ledger declares dependencies Taskmaster cannot enforce across tags.
Each line is a tuple: <FROM_TASK> -> <REQUIRES> with optional rationale.

## Legend
- Task IDs are <TAG>.<NUM> (e.g., API.62, VEC.64, DB.69, ADM.3, INFRA.2)
- "REQUIRES" lists one or more prerequisites across tags
- Keep entries alphabetized by FROM_TASK

## Ledger
- ADP.38/39/40/41 (Typegen epics) -> API.62 | Adapter contracts precede typegen usage
- ADM.1 (Dashboards) -> API.62, DB.67, DB.69 | Observability depends on data flow
- ADM.3 (Operational metrics) -> API.62 | Emit metrics from IO policy
- API.23 (Hybrid search endpoint) -> VEC.64, DB.69 | Requires vector store & policy
- DB.67 (Core schema registry) -> API.62 | Ingest writes rely on adapter contracts
- DB.69 (Municipality registry + embeddings tables) -> DB.67, VEC.64 | Schema and vector policy first
- INFRA.3 (CI: typecheck/lint/tests/contract) -> API.62, ADP.* | CI runs after adapter baselines
- VEC.64 (Vectorization strategy & ingestion shaping) -> API.62 | Needs normalized fetch surface

## Inferred (needs confirmation)
(Append new lines here for any cross-tag deps discovered during validation; alphabetize by FROM_TASK)

## Update Rules
- Add new lines whenever tasks cross tags
- Keep rationales short and factual
- Update this file in the same PR as the task changes