Quarantined Python ingestion package for civic document metadata. This package emits JSONL artifacts with provenance for downstream materialization.

Key points:
- No direct writes to production tables.
- No Google Sheets usage.
- Metadata only (no content lake ingestion).
- Deterministic, idempotent runs.

CLI commands:
- `civic-ingest list-sites`
- `civic-ingest fetch --site sfbos --doc-type minutes --since-year 2018 --out data/raw/sfbos`
- `civic-ingest extract --input data/raw/sfbos --out data/artifacts/sfbos/$(date +%F).jsonl`

JSONL record shape (per document):
{
  "source_url": "https://.../file.pdf",
  "doc_type": "minutes|agenda",
  "committee": "Land Use and Transportation",
  "meeting_date": "YYYY-MM-DD",
  "sha256": "...",
  "mime": "application/pdf",
  "file_size": 123456,
  "page_count": 42,
  "extracted": {
    "title": "...",
    "items": [
      {"position": 1, "title": "..."}
    ]
  },
  "extracted_at": "ISO-8601",
  "extractor": {"name": "civic-ingest", "version": "0.1.0"}
}

Run locally (uv or venv):
- `uv venv && uv pip install -e .`
- Or `python -m venv .venv && source .venv/bin/activate && pip install -e .`

Tests: `pytest -q` (fixtures kept small; no network).

