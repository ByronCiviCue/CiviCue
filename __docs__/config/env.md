## Environment configuration (normalized)

- Global Socrata token: `SOCRATA_APP_TOKEN`
- Host overrides: `SOCRATA__{HOST}__APP_TOKEN` (e.g., `SOCRATA__data.sfgov.org__APP_TOKEN`)
- No city-named keys in code. Resolver selects the right value per host.
- Env is lazy: `getEnv()` validates on first call; `CIVICUE_SKIP_ENV_VALIDATION=1` or `--help` skips validation for tooling.
