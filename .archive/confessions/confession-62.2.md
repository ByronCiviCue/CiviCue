62.2 – Socrata Column metadata & type map

Changes
- Added `src/adapters/socrata/metadata.ts` implementing:
  - `fetchDatasetMetadata({ domain, datasetId })` using Socrata views API and existing token headers.
  - `normalizeColumn` and `mapLogicalType` with deterministic mapping.
- Added `src/adapters/socrata/types.ts` with stable `LogicalType`, `NormalizedColumn`, `DatasetMetadata`.
- Added tests `tests/socrata.metadata.spec.ts` with fetch spy fixtures (no network).
- Added brief docs `__docs__/adapters/socrata/metadata.md` describing contract.

Design notes
- Mapping covers common Socrata `dataTypeName` values. Location uses `subColumnType` to refine to `point`/`polygon` else `location`.
- `nullable` defaults true; `flags` including `required` flips to false. Other flags ignored.
- Only documented fields are parsed from the view response.

Out of scope
- No discovery/rows client changes. No env plumbing changes.

Validation
- Vitest suite uses deterministic fixtures (mocked `fetch`).

Follow-up (public surface + lint)
- Replaced `src/adapters/socrata/types.ts` with required public API: ClientErrorKind/Shape, createClientError, isSocrataClientError, RowClientOptions, PageResult, plus re-exported metadata types to avoid breakage.
- Updated imports in `src/adapters/socrata/http.ts` and `rowsClient.ts` to use new types surface (no logic changes).
- Lint fixes in metadata: type-only import, removed duplicate switch branch, simplified inferNullable to single-return.

Additional fixes (error contract and timing)
- Normalize error shape: string kind with sibling detail fields (status, attempts, url, message); removed wrapper Error usage.
- Ensure no retries for 4xx except 429 (handled in http fetchWithRetry path); rows client behavior unchanged.
- Tests use fake timers and advance timers for retry/backoff; assertions updated to match error contract.

- Normalize error shape to plain object: { error: { kind: 'HttpError' | 'RetryExhausted', status?, attempts?, url?, message? } }
- Switch http.ts to createClientError(kind, info); no runtime behavior change beyond shape.
- Define RowClientOptions/PageResult types and re-export metadata normals.
- Tests all green (42/42); lint/typecheck clean; no eslint disables added.
