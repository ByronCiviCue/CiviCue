62.7 – Socrata Regional Endpoint Routing (US/EU)

- Added region resolver with env precedence and caching.
- Discovery client uses regional base with single failover on network/5xx.
- Dataset clients unchanged (host-based).
- Tests mock fetch; no network; pass locally.
- Docs added for env and behavior.

- Added clearSocrataRegionCache() to reset resolver cache between tests
- Updated socrata.region.spec.ts to clear cache in beforeEach
- Removed obsolete snapshot artifacts; tests no longer use snapshots
- No logic redesign; failover rules unchanged
