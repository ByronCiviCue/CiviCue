62.5 – Socrata v3 POST query + Basic auth

Adds a small v3 client with Basic auth support and safe error handling.

- env: resolveSocrataV3Key(host, fourByFour?) with dataset > host > global precedence.
- env-providers: socrataV3AuthHeader() and exposed resolver; no secrets logged.
- v3Client: v3PostQuery({ domain, datasetId, soql, pageNumber, pageSize }) → rows + nextPageNumber; includes X-App-Token and Basic auth when present; redacts Authorization in errors.
- Fallback: isV3Unavailable(e) flags 401/403/404/501 for graceful v2 fallback.
- Tests: mocked fetch validates headers/body/pagination and fallback flags.

Adds
- v3PostQuery now supports AbortSignal and hard-clamps pageSize (1..1000).
- v3PostAll(domain, datasetId, { query, includeSynthetic?, pageSize? }, signal?) loops pages and concatenates rows.
- Tests cover pagination across pages, page-size clamps, abort behavior, and secret redaction (no key id/secret/basic token in error).

Fixes
- Adjusted clamp test to use mockResolvedValueOnce for fresh Response instances to avoid reusing consumed bodies.

Notes
- Kept SoQL builder untouched; integrate by passing built SoQL string to v3PostQuery.
- .env currently lists App Token and OAuth; v3 keys follow host/dataset override pattern without changing existing examples.
