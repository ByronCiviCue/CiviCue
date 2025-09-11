Added cross-tag dependency ledger and idempotent doc injector.
Dependency validator added; report at __docs__/planning/dependency-audit.md.
Updated .taskmaster docs with single-line pointer under H1 (idempotent).
Normalized task meta.depends_on; unresolved refs recorded in meta.warnings.
2025-09-11T05:13:46.000Z
Fixed no-unused-vars in dependency validator.
Rewrote CLI arg parser with iterator (no indexing, no dynamic props); removed security/object-injection warnings; reduced complexity.
2025-09-11T06:54:26.000Z
Fix: upsert counts agencies correctly via grouped aggregation; composite conflict on (host,domain).
Migration: add unique index ux_socrata_muni_index_host_domain.
No behavior changes elsewhere; dataset_count remains placeholder=0.
2025-09-11T07:02:15.000Z
Fix: replace invalid eb.sql with Kysely sql helper in municipality upsert.
Typecheck now passes; no behavioral changes.
2025-09-11T07:05:42.000Z