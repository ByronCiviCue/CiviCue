Socrata Regions (US/EU)

- Supported regions: US, EU.
- Discovery API bases:
  - US: https://api.us.socrata.com
  - EU: https://api.eu.socrata.com
- Env overrides (precedence):
  - Per-host: `SOCRATA__{HOST}__REGION` (US|EU)
  - Global: `SOCRATA_REGION` (US|EU)
  - Invalid values are ignored; default is US.
- Discovery failover: single retry to the other region on network error or 5xx. No failover on 401/403/404.
- Dataset clients (v2/v3) remain host-based; only discovery uses regional base.

