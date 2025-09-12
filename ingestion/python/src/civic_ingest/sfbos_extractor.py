from __future__ import annotations
import hashlib
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Tuple, Optional

import requests
from bs4 import BeautifulSoup

from .models import DocRecord, ExtractedItem, ExtractedPayload


@dataclass
class FetchConfig:
    since_year: int = 2018
    doc_type: str = "minutes"  # or "agenda"
    user_agent: str = "Mozilla/5.0 (civic-ingest)"


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_listing(base_url: str, cfg: FetchConfig) -> List[Tuple[str, str]]:
    """Return list of (YYYY-MM-DD, pdf_url) for rows >= since_year.

    Only parses the first table on the page and picks the column by doc_type.
    """
    headers = {"User-Agent": cfg.user_agent}
    url = f"{base_url}"
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    table = soup.find("table")
    if not table:
        return []
    rows = table.find_all("tr")[1:]
    out: List[Tuple[str, str]] = []
    for row in rows:
        cols = row.find_all("td")
        if len(cols) < 3:
            continue
        date_text = cols[0].get_text(strip=True)
        m = re.search(r"([A-Za-z]+\s+\d{1,2},?\s+\d{4})", date_text)
        if not m:
            continue
        dt = datetime.strptime(m.group(1).replace(",", ""), "%B %d %Y")
        if dt.year < cfg.since_year:
            continue
        file_td = cols[2] if cfg.doc_type.lower() == "minutes" else cols[1]
        link = file_td.find("a", href=re.compile(r"\.pdf$", re.I))
        if not link:
            continue
        href = link.get("href")
        if not href:
            continue
        absolute = requests.compat.urljoin(base_url, href)
        out.append((dt.strftime("%Y-%m-%d"), absolute))
    return out


def download_pdf(url: str, dest_dir: Path, headers: Optional[dict] = None) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = url.rsplit("/", 1)[-1]
    # Ensure .pdf suffix
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    path = dest_dir / name
    if path.exists():
        return path
    r = requests.get(url, headers=headers or {"User-Agent": "Mozilla/5.0 (civic-ingest)"}, timeout=60)
    r.raise_for_status()
    with path.open("wb") as f:
        f.write(r.content)
    return path


def extract_metadata(pdf_path: Path, source_url: str, committee: Optional[str], doc_type: str) -> DocRecord:
    # Lightweight metadata only; content extraction optional.
    sha = _sha256_file(pdf_path)
    size = pdf_path.stat().st_size
    page_count: Optional[int] = None
    title: Optional[str] = None
    try:
        import pdfplumber  # type: ignore
        with pdfplumber.open(str(pdf_path)) as pdf:
            page_count = len(pdf.pages)
            # Try to sniff a title from the first page few lines
            first_text = pdf.pages[0].extract_text() or ""
            m = re.search(r"(?:Meeting|Agenda).*", first_text, re.I)
            title = m.group(0).strip() if m else None
    except Exception:
        pass

    rec = DocRecord(
        source_url=source_url,
        doc_type=doc_type,
        committee=committee,
        sha256=sha,
        file_size=size,
        page_count=page_count,
        extracted=ExtractedPayload(title=title, items=[]),
    )
    return rec

