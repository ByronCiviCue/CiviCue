# CiviCue Planning Canvas

## 0) Snapshot (today)
- Pipeline status: CSV → landing → staging → core (evictions) in place.
- Seeds + QA checks added; README has first-run sequence.
- Next two workstreams:
  1) 311 vector + hybrid search (dirty JSON, dedup, semantic search)
  2) Reverse ETL scaffolding (DB → Google Sheets views)

## 1) Architecture decisions
- **System of record:** Postgres.
- **Vector index:** pgvector **inside Postgres** (single-system simplicity). If scale requires, we can swap to Qdrant/Milvus later via the same embeddings contract.
- **Hybrid search:** full-text (tsvector/BM25) + vector cosine; re-rank by weighted score.

## 2) 311 ingestion & normalization
- landing_raw.311_raw: JSON rows as-is + row_hash + ingested_at.
- staging_clean.311: cast fields, trim, normalize address/dates; deterministic row_hash.
- core.fact_311: business key = `service_request_id` if present; else deterministic hash of `(address, opened_date, category, description)`.

### 2.1) Dedup strategy
- Primary: `content_hash` (normalized key text).
- Secondary near-dup: cosine_sim > 0.98 **AND** same address **AND** opened_date within ±3 days ⇒ mark duplicate_of.
- Tertiary: fuzzy key (Levenshtein on `service_request_id`) for vendor glitches.

## 3) Embeddings schema (contract)
We will add an `embeddings` schema and an `emb_311` table. (Note: enabling pgvector will be handled in a later step; this file does not run SQL.)

**Columns (contract):**
- emb_id BIGSERIAL PK
- case_id TEXT NULL (FK to core.fact_311 when available)
- text TEXT NOT NULL  -- canonical text: category + description + address + agency notes
- embedding VECTOR    -- dimension TBD (e.g., 768)
- meta JSONB          -- {source_file, district, opened_date, category, …}
- content_hash TEXT UNIQUE NOT NULL

**Indexes (once pgvector is enabled):**
- `ivfflat (embedding)` with cosine distance
- btree `(case_id)`
- GIN `to_tsvector('simple', text)` for hybrid search

### 3.1) Canonical text builder (pseudo)

```
text = concat_ws(' | ',
  coalesce(category,''),
  coalesce(subcategory,''),
  coalesce(description,''),
  coalesce(address,''),
  coalesce(agency_notes,'')
)
```

## 4) Hybrid query pattern (SQL sketch; do not execute)

```sql
WITH q AS (
  SELECT
    to_tsvector('simple', $1)            AS qvec,
    $2::vector                           AS qemb
),
text_hits AS (
  SELECT e.emb_id, ts_rank_cd(to_tsvector('simple', e.text), (SELECT qvec FROM q)) AS bm25
  FROM embeddings.emb_311 e
  WHERE to_tsvector('simple', e.text) @@ plainto_tsquery('simple', $1)
  ORDER BY bm25 DESC
  LIMIT 200
),
vec_hits AS (
  SELECT e.emb_id, 1 - (e.embedding <=> (SELECT qemb FROM q)) AS cos
  FROM embeddings.emb_311 e
  ORDER BY e.embedding <=> (SELECT qemb FROM q)
  LIMIT 200
),
unioned AS (
  SELECT emb_id,
    COALESCE(MAX(bm25),0) AS bm25,
    COALESCE(MAX(cos),0)  AS cos
  FROM (
    SELECT emb_id, bm25, NULL::float AS cos FROM text_hits
    UNION ALL
    SELECT emb_id, NULL::float AS bm25, cos FROM vec_hits
  ) u
  GROUP BY emb_id
)
SELECT u.emb_id, u.bm25, u.cos,
  0.6 * u.bm25 + 0.4 * u.cos AS score
FROM unioned u
ORDER BY score DESC
LIMIT 50;
```

## 5) API integrations (roadmap)
- 311 API: polling worker → landing_raw.311_raw; store etag/last_seen; exponential backoff; circuit-breaker on 5xx.
- Other datasets (crime, permits, minutes):
  - Same landing → staging → core pattern
  - Use dataset registry in `config/datasets.json`
- Secrets via `.env` or OS keychain; never commit keys.

## 6) Reverse ETL (preview)
- Views in `core` (e.g., `v_evictions_report`) published to Sheets tabs.
- `services/replication/dbToSheets.ts` will:
  - Respect `SHEETS_EXPORT_ENABLED=true` to run.
  - Overwrite target tab atomically (write temp sheet, then swap).
  - Append version row (exported_at, source_view, row_count).

## 7) Milestones & acceptance
- M1: Enable pgvector in docker image; add `embeddings` schema + `emb_311` table. **Acceptance:** migration applies; extension installed.
- M2: 311 loader (JSON) → landing + staging + core. **Acceptance:** counts logged; dedup metrics present.
- M3: Embedding job (batch) → `embeddings.emb_311`. **Acceptance:** N embeddings created; unique content_hash enforced.
- M4: Hybrid search endpoint (CLI first). **Acceptance:** returns top-K with bm25, cos, score.
- M5: Reverse ETL for one view. **Acceptance:** Sheet populated from DB view via script.

## 8) Risks & mitigations
- Dirty keys / null business keys → staging QA checks; reject or sandbox.
- Extension/compat issues → pin Postgres image and pgvector version; add healthcheck.
- API throttling → exponential backoff + jitter; cache ETags.

## 9) Non-goals (for now)
- Realtime streaming; cross-DB writes; cloud vendor lock-in.

---