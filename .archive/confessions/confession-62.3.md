62.3 – SoQL builder (typed, safe)

- buildSoql(input): validates identifiers against allow-list; assembles $select/$where/$order/$group/$limit/$offset and $-prefixed extras.
- serializeValue(v): quotes and escapes strings, handles numbers/boolean/Date/null, arrays; rejects objects.
- Deterministic tests: tiny fixtures, no network; asserts exact param strings.
- ESM only; lint/typecheck clean.

