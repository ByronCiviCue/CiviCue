# Normalization Map

Purpose
- Canonicalize dataset fields across portals into BranchItem shape.

Template
- Dataset: <name> (<portal/source>)
- Native fields: id, title/name, address, date(s), status, geo, links
- Mapping → BranchItem: id, title, address, status, timestamps, location, provenance
- Transforms: trim, case, enum mapping, date parsing, address normalization
- Dedupe key(s): <fields>
- Notes: <quirks>
