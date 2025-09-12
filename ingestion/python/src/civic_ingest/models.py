from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, date


class ExtractedItem(BaseModel):
    position: int
    title: str


class ExtractedPayload(BaseModel):
    title: Optional[str] = None
    items: List[ExtractedItem] = Field(default_factory=list)


class ExtractorMeta(BaseModel):
    name: str = "civic-ingest"
    version: str = "0.1.0"


class DocRecord(BaseModel):
    source_url: str
    doc_type: Literal["minutes", "agenda"]
    committee: Optional[str] = None
    meeting_date: Optional[date] = None

    sha256: str
    mime: str = "application/pdf"
    file_size: Optional[int] = None
    page_count: Optional[int] = None

    extracted: ExtractedPayload = Field(default_factory=ExtractedPayload)
    extracted_at: datetime = Field(default_factory=datetime.utcnow)
    extractor: ExtractorMeta = Field(default_factory=ExtractorMeta)


def to_jsonl_line(record: DocRecord) -> str:
    return record.model_dump_json()

