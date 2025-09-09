HTTP Cassettes (record/replay)
- Modes: record (capture live responses), replay (serve fixtures), passthrough (real network).
- Helper: `withCassette(testName, fn, { mode })` stores/reads fixtures at `tests/fixtures/cassettes/{testName}.json`.
- Redaction: Authorization header is omitted during recording.
- CI: run in replay mode only to avoid network. Regenerate fixtures locally in record mode.
- Keep fixtures minimal and deterministic (no volatile timestamps).

Usage example
```
await withCassette('v3-client-basic', async () => {
  const res = await v3PostQuery({ domain, datasetId, soql: 'select *' });
  expect(res.rows.length).toBeGreaterThan(0);
}, { mode: 'replay' });
```

