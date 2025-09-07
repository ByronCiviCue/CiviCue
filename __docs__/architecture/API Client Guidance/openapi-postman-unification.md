# OpenAPI + Postman Unification

Examples version: v0.1.0 — Updated: 2025-09-06

Keep OpenAPI as the source of truth. Generate, sync, and validate Postman collections from OpenAPI. Run collections in CI (Newman) to catch regressions.

## Goals

- Single, authoritative OpenAPI spec in-repo (e.g., `openapi.yaml`).
- Postman collections auto-generated from OpenAPI (no manual drift).
- Environments for `baseUrl` and `apiKey` with consistent variable names.
- CI validating the spec and executing collections against staging.

## Directory Layout

- openapi.yaml: Top-level OpenAPI spec.
- postman/
- ExampleAPI.postman_collection.json: Generated from OpenAPI.
  - environments/
    - dev.postman_environment.json
    - staging.postman_environment.json

## Authoring OpenAPI

- Version routes from day one (`/v1/...`).
- Define security schemes for API key:

```yaml
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
security:
  - ApiKeyAuth: []
```

- Use concrete response schemas and examples for key endpoints. Include RFC7807 error schema.

## Generating Postman Collections

Option 1: CLI (fastest)

```bash
npx openapi-to-postmanv2 -s openapi.yaml -o postman/ExampleAPI.postman_collection.json -p
```

- `-p` enables pretty-printing for diffs.
- Re-run this command when the spec changes.

Option 2: Postman app/workspace

- Import OpenAPI via “APIs” tab → “Define” → “Import” → “Generate Collection”.
- Configure “Watch” the repo’s `openapi.yaml` or use CI to re-import via Postman’s API.

## Postman Environments

- Use consistent variable names across environments:
- `baseUrl`: e.g., `https://api.example.com`
  - `apiKey`: your test key

Example `dev.postman_environment.json`:

```json
{
  "id": "env-dev",
  "name": "dev",
  "values": [
    { "key": "baseUrl", "value": "https://api-dev.example.com", "type": "default" },
    { "key": "apiKey", "value": "DEV_API_KEY", "type": "secret" }
  ]
}
```

## Mapping OpenAPI → Postman Variables

- In OpenAPI, reference server URL as `https://{{baseUrl}}` or set Postman to override base URL.
- In collection auth, set a default header: `x-api-key: {{apiKey}}`.

## Running Collections in CI (Newman)

Install:

```bash
npm i -D newman
```

Run against staging:

```bash
npx newman run postman/ExampleAPI.postman_collection.json \
  -e postman/environments/staging.postman_environment.json \
  --timeout-request 10000 \
  --reporters cli,junit \
  --reporter-junit-export newman-results.xml
```

CI outline (GitHub Actions):

```yaml
name: API CI
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - name: Generate Postman collection
        run: npx openapi-to-postmanv2 -s openapi.yaml -o postman/ExampleAPI.postman_collection.json -p
      - name: Run Newman against staging
        run: |
          npx newman run postman/ExampleAPI.postman_collection.json \
            -e postman/environments/staging.postman_environment.json \
            --timeout-request 10000 \
            --reporters cli,junit \
            --reporter-junit-export newman-results.xml
```

## Keeping Docs in Sync

- OpenAPI drives Swagger UI and Redoc (see railway-api-service.md).
- Postman collection is generated, not hand-edited. Commit the generated file to simplify diffs and local runs.
- Add pre-commit or CI check that fails when collection is out-of-date.

Example check script:

```bash
npx openapi-to-postmanv2 -s openapi.yaml -o /tmp/collection.json -p
if ! diff -q /tmp/collection.json postman/ExampleAPI.postman_collection.json; then
  echo "Postman collection is out of date. Run the generator." >&2
  exit 1
fi
```

## Examples & Tips

- Examples in OpenAPI: Provide `examples` for query params and responses to improve Postman’s example requests.
- Error handling: Include `application/problem+json` responses for 4xx/5xx.
- Auth: Document API key usage and rate-limit headers in OpenAPI; Postman can display them.
- Versioning: Maintain separate collections per major API version, or a single collection with `/v1` routes.

## Troubleshooting

- Mismatch between base URL and collection: Ensure `servers.url` in OpenAPI or override with environment `baseUrl`.
- Missing headers in Postman requests: Set default auth/header at the collection level.
- New routes not appearing: Re-run the generator and commit the updated collection.
