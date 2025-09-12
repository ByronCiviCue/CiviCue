62.6 – Test Rig (record/replay)

- Added cassette helper: tests/helpers/httpCassette.ts with record/replay/passthrough modes.
- Fixtures stored under tests/fixtures/cassettes/*.json with minimal redacted payloads.
- Updated socrata.v3Client.spec.ts and socrata.client.spec.ts to include cassette-backed tests with snapshots and property checks (size ≥ N, required fields present).
- Docs: __docs__/adapters/socrata/cassettes.md explains modes, paths, and CI replay usage.
- No runtime changes; all network calls in specs are replayed from fixtures in CI.


- Enforced strict header whitelist
- Added replay request validation
- Safe body serialization for record mode
- Guardrails on cassette size
- Removed unsafe any in fetch override
- Fixed security lint by normalizing allowed headers in cassette helper. All tests pass, no lint or type issues remain.
- Replaced brittle snapshots with stable-field assertions in cassette-backed tests.
