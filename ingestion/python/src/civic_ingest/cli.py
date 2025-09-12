from __future__ import annotations
import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from .sites import SITES, get_site
from .sfbos_extractor import FetchConfig, fetch_listing, download_pdf, extract_metadata
from .models import to_jsonl_line


def cmd_list_sites(_: argparse.Namespace) -> int:
    for s in SITES:
        print(f"{s.key}\t{s.name}\t{s.base_url}")
    return 0


def cmd_fetch(args: argparse.Namespace) -> int:
    site = get_site(args.site)
    cfg = FetchConfig(since_year=args.since_year, doc_type=args.doc_type)
    out_dir = Path(args.out)
    print(f"Listing documents from {site.base_url} since {cfg.since_year} ({cfg.doc_type})")
    items = fetch_listing(site.base_url, cfg)
    print(f"Found {len(items)} items")
    for date_str, url in items:
        path = download_pdf(url, out_dir)
        print(f"saved {path.name}")
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    site = get_site(args.site)
    in_dir = Path(args.input)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc_type = args.doc_type or site.default_doc_type
    count = 0
    with out_path.open("w", encoding="utf-8") as f:
        for pdf in sorted(in_dir.glob("*.pdf")):
            rec = extract_metadata(pdf, source_url=f"file://{pdf}", committee=site.committee, doc_type=doc_type)
            f.write(to_jsonl_line(rec) + "\n")
            count += 1
    print(f"Wrote {count} records to {out_path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="civic-ingest", description="Civic document ingestion (JSONL emitter)")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("list-sites", help="List known sites")
    ps.set_defaults(func=cmd_list_sites)

    pf = sub.add_parser("fetch", help="Fetch PDFs for a site")
    pf.add_argument("--site", required=True, help="Site key (e.g., sfbos_lut)")
    pf.add_argument("--doc-type", default="minutes", choices=["minutes", "agenda"], help="Document type")
    pf.add_argument("--since-year", type=int, default=2018)
    pf.add_argument("--out", required=True, help="Directory to write PDFs")
    pf.set_defaults(func=cmd_fetch)

    pe = sub.add_parser("extract", help="Extract JSONL metadata from PDFs")
    pe.add_argument("--site", required=True, help="Site key (e.g., sfbos_lut)")
    pe.add_argument("--input", required=True, help="Directory containing PDFs")
    pe.add_argument("--out", required=True, help="Path to write JSONL")
    pe.add_argument("--doc-type", choices=["minutes", "agenda"], help="Override document type")
    pe.set_defaults(func=cmd_extract)
    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

