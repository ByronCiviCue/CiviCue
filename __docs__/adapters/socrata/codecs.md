Contract
- getCodecs(): returns a set of parse/format codecs for common Socrata logical types.
- codecFor(type): returns a single codec by logical type key.
- parse maps raw JSON → canonical runtime; format maps runtime → JSON-safe value.

Notes
- number/money/percent parse finite numbers; invalid inputs return null.
- date/datetime expect ISO-like strings or Date; invalid dates return null.
- checkbox accepts boolean/"true"/"false"/1/0 strings; others return null.
- location/point/polygon accept typical Socrata/GeoJSON shapes, best-effort normalization.

