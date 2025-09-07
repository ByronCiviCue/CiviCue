# Branch Design: sf.housing.permits

Scope
- Pilot branch blending multiple SF sources (Socrata + optional ArcGIS/CKAN) into normalized PermitItem.

Plan
- Inputs: list datasets/fields; define dedupe keys; define freshness scoring.
- Fetch: adapter configs, pagination, error handling.
- Fuse: normalization map application, conflict resolution, provenance.
- Outputs: example items; tests (golden files).
