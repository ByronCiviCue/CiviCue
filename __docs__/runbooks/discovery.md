# Socrata Discovery Runbook

This runbook documents the extended Socrata discovery and SF directory refresh processes.

## Prerequisites

### Environment Variables
- `SOCRATA_APP_TOKEN`: Valid Socrata application token
- `DATABASE_URL`: PostgreSQL connection string with write access

### Safety
- **Never run in CI environments** - scripts will automatically exit
- **Token scoping**: Ensure SOCRATA_APP_TOKEN has appropriate permissions
- **Database access**: Requires write permissions to create tables and insert data

## Extended Discovery (US + EU)

Populates the PostgreSQL registry with Socrata hosts, domains, and agencies from both US and EU regions.

### Usage

```bash
node bin/socrata-discover.mjs --limit=50000 --page-size=500
```

### Parameters

- `--limit=<n>`: Maximum domains to fetch per region (default: 50000)
- `--page-size=<n>`: Page size for API requests (default: 500)
- `--regions=US,EU`: Comma-separated regions (default: US,EU)
- `--dry-run`: Skip database writes (for testing)

### Expected Artifacts

- **Database tables populated**:
  - `socrata_hosts`: ~1000-2000 hosts across regions
  - `socrata_domains`: Same as hosts (1:1 mapping)
  - `socrata_agencies`: ~5000-10000 agency records

- **JSONL snapshots**:
  - `__data__/catalog/socrata/us-domains-YYYYMMDD.jsonl`
  - `__data__/catalog/socrata/eu-domains-YYYYMMDD.jsonl`

### Expected Counts (Order of Magnitude)

- **US Region**: ~800-1200 domains
- **EU Region**: ~200-400 domains
- **Total Agencies**: ~5000-15000 across all domains

## Repopulate SF Directory

Refreshes the San Francisco dataset directory using the new catalog API.

### Usage

```bash
node bin/sf-refresh.mjs --host=data.sfgov.org --limit=20000
```

### Parameters

- `--host=<hostname>`: Socrata host to fetch (default: data.sfgov.org)
- `--limit=<n>`: Maximum items to fetch (default: 100000)
- `--page-size=<n>`: Page size for requests (default: 500)
- `--out=<path>`: Output file path (default: municipalities/CA/SF/directory.json)

### Output Files

- **Directory**: `municipalities/CA/SF/directory.json`
  - Normalized dataset metadata
  - ~600-800 datasets for SF
  - Categories, tags, and metadata

- **Audit**: `__data__/sf/sf-datasets-YYYYMMDD.jsonl`
  - Raw API responses for debugging
  - One JSON object per page fetched

## Verification Queries

After running discovery, verify the data using these SQL queries:

### Host counts by region
```sql
SELECT region, COUNT(*) AS hosts 
FROM socrata_hosts 
GROUP BY region 
ORDER BY region;
```

Expected results:
- EU: ~200-400
- US: ~800-1200

### Agency distribution
```sql
SELECT host, COUNT(*) AS agencies 
FROM socrata_agencies 
WHERE host='data.sfgov.org'
GROUP BY host;
```

Expected: ~10-50 agencies for SF

### Top agencies by host
```sql
SELECT host, COUNT(*) AS agencies 
FROM socrata_agencies 
GROUP BY host 
ORDER BY agencies DESC 
LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **Token rate limits**: Reduce `--page-size` or add delays
2. **Network timeouts**: The scripts include automatic failover between US/EU regions
3. **Database connection**: Ensure DATABASE_URL is valid and accessible

### File Locations

All output files use YYYYMMDD date format:
- Snapshots: `__data__/catalog/socrata/`
- SF audit: `__data__/sf/`
- Directory: `municipalities/CA/SF/directory.json`

### Validation

Check file creation and content:
```bash
# List snapshots
ls -lh __data__/catalog/socrata/*jsonl

# List SF files  
ls -lh __data__/sf/*.jsonl

# Count datasets in directory
jq '. | .totalDatasets' municipalities/CA/SF/directory.json
```

## Security Notes

- Scripts automatically refuse to run in CI environments
- All API tokens should be scoped to read-only access
- Database credentials should have minimal required permissions
- JSONL files may contain sensitive metadata - review before sharing