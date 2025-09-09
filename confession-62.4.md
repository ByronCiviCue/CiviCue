62.4 – Socrata Codecs + SoQL nits

Codecs
- Added src/adapters/socrata/codecs.ts with getCodecs() and codecFor(); parse/format for text, number/money/percent, checkbox, date/datetime, url/email/phone, location, point, polygon, json, unknown.
- Deterministic unit tests in tests/socrata.codecs.spec.ts; no network.

SoQL nits fixed
- Require scalar values for scalar operators; LIKE/ILIKE enforce string type (tests added).
- Reject NaN/±Infinity via existing finite check; added nit coverage for empty allow-list and scalar value requirement.
- Keep API stable; only validation tightened.

Follow-up fix
- Codecs are now a module-level singleton; `codecFor(type)` returns the exact same object as `getCodecs().<type>` to satisfy referential identity (`toBe`) tests.
