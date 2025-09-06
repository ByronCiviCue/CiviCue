-- Canonicalize JSONB by sorting keys deterministically and producing text
CREATE OR REPLACE FUNCTION public.jsonb_canon_text(js jsonb)
RETURNS text
LANGUAGE SQL
IMMUTABLE
AS $$
SELECT COALESCE(
  (
    SELECT '{' || string_agg(format('%s:%s', to_jsonb(k)::text, jsonb_canon_text(v)), ',') || '}'
    FROM (
      SELECT key AS k, value AS v
      FROM jsonb_each(js)
      ORDER BY key
    ) s
  ),
  CASE
    WHEN js ?| array['0'] THEN
      -- array case
      '[' || (
        SELECT string_agg(jsonb_canon_text(value), ',')
        FROM jsonb_array_elements(js)
      ) || ']'
    ELSE
      js::text
  END
);
$$;