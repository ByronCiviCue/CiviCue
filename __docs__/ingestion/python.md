# Python Ingestion Package (Quarantined)

This package lives under `ingestion/python` and emits JSONL records for civic document metadata with provenance. It does not write directly to production tables; materialization happens in the Node/Kysely layer (see Database tasks DB.5 and DB.6).

## Commands

- `civic-ingest list-sites` — list configured sites
- `civic-ingest fetch --site sfbos_lut --doc-type minutes --since-year 2018 --out data/raw/sfbos` — download PDFs
- `civic-ingest extract --site sfbos_lut --input data/raw/sfbos --out data/artifacts/sfbos/$(date +%F).jsonl` — emit JSONL

## JSONL Schema

See `ingestion/python/README.md` for the record shape. Each line is a `DocRecord` with `source_url`, `sha256`, `mime`, `file_size`, `page_count`, `committee`, `meeting_date?`, `doc_type`, `extracted` (title/items), `extracted_at`, and `extractor` (name/version).

## Include/Exclude Manifest (from civicinsight)

Included (logic reimplemented/ported):
- `py/scrape_committees.py` — committee page listing and PDF download (generalized in `sfbos_extractor.py`).
- `py/inspect_pdf.py` / `py/pdf_to_csv.py` — minimal metadata extraction adapted to JSONL (page count, title sniffing).

Excluded:
- `py/sheets.py`, `py/models.py`, `py/analyze_data.py`, `py/data_insights.py`, `py/generate_housing_flashpoints.py`, `py/housing_hypocrisy.py` — analytics/Google Sheets/experiments.
- Notebooks, CSV outputs, and any Google Sheets credentials/tokens.

Rationale: We keep ingestion deterministic, metadata-only, and avoid side-effects (Sheets). Downstream materialization is handled by DB.5/DB.6.

## Local Dev

- Create venv and install: `uv venv && uv pip install -e .` (or pip)
- Run commands with `python -m civic_ingest.cli ...` if no script entry installed.

## Integration Flow

1) `fetch` PDFs to `data/raw/...` (idempotent by filename).
2) `extract` emits JSONL to `data/artifacts/...` with full provenance.
3) DB.5 materializer ingests JSONL → `civic.stage_documents` (idempotent upsert by sha256).
4) DB.6 normalizes staging → `civic.meetings`, `civic.documents`, `civic.items`.

## Notes

- Respect robots and throttling; the extractor sends a friendly User-Agent.
- Extend `sites.py` to add more committees or cities; avoid hardcoding in code paths.

