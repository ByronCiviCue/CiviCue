V3 POST Query Client
- Endpoint: POST `/api/v3/views/{four_by_four}/query.json`
- Body: `{ query: "<SoQL>", page: { pageNumber, pageSize }, includeSynthetic: true }`
- Pagination: pageNumber starts at 1 and increments while a page returns `pageSize` rows.
- Page size clamp: 1..1000 (values outside are clamped).
- Auth: Basic using env keys; X-App-Token added when configured.
- Env precedence (keyId/keySecret): dataset (SOCRATA__{HOST}__{FOURBYFOUR}__V3_KEY_ID/SECRET, four-by-four lowercased without dashes) → host (SOCRATA__{HOST}__V3_KEY_*) → global (SOCRATA_V3_KEY_*).
- Security: Authorization is never logged; errors include only status/url/message (no secrets); tests enforce redaction.
- Abort: optional AbortSignal supported; abort stops the in-flight request.
- Fallback: treat 401/403/404/501 as v3 unavailable; caller may fall back to v2 rows client.
