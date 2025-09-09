Contract: Socrata metadata normalization

Exports
- `fetchDatasetMetadata({ domain, datasetId }) => Promise<DatasetMetadata>`
- `normalizeColumn(col)` and `mapLogicalType(apiType, col?)` for reuse

Types
- `LogicalType`: text | number | checkbox | date | datetime | money | percent | url | email | phone | location | point | polygon | json | unknown
- `NormalizedColumn`: { id, name, fieldName, apiType, logicalType, nullable, hidden, description? }
- `DatasetMetadata`: { id, domain, columns: NormalizedColumn[] }

Behavior
- Fetches `https://{domain}/api/views/{datasetId}.json` with `Accept: application/json` and `X-App-Token` when available.
- Parses only documented fields from `columns[]`.
- Logical type mapping is deterministic and does not rely on undocumented fields. Location honors `subColumnType`.
- `nullable` defaults to true; `flags` containing `required` sets to false.

Notes
- No network in tests; use fetch spy.
- Do not edit tasks/config here; adapter-only.

