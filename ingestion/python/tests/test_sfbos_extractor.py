from pathlib import Path
from civic_ingest.models import DocRecord, ExtractedPayload, ExtractedItem, to_jsonl_line


def test_jsonl_roundtrip_minimal():
    rec = DocRecord(
        source_url="https://example.test/x.pdf",
        doc_type="minutes",
        committee="Test Committee",
        sha256="abc123",
        file_size=123,
        page_count=1,
        extracted=ExtractedPayload(title="Meeting Minutes", items=[ExtractedItem(position=1, title="Call to order")]),
    )
    line = to_jsonl_line(rec)
    assert "source_url" in line
    assert "Meeting Minutes" in line

