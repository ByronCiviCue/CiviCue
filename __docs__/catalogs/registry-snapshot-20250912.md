# Socrata Dataset Registry Snapshot - 2025-09-12

## Executive Summary

This report documents the implementation of Socrata dataset-level discovery and indexing capabilities for the CiviCue municipal data platform. The enhancement extends our existing municipality-level catalog to include comprehensive dataset metadata, enabling fine-grained discovery and analysis of open data resources across US and EU Socrata instances.

## Run Parameters

### Configuration
- **Regions**: US, EU
- **Page Size**: 500 items per API call
- **Limit**: 50,000 total items per phase
- **Batch Size**: 500 datasets per database transaction
- **Processing Model**: Sequential (municipality discovery → dataset discovery)

### Command Line Interface
```bash
# Default behavior (both phases enabled)
./src/cli/catalog/discoverSocrata.ts

# Dataset discovery only
./src/cli/catalog/discoverSocrata.ts --datasets=true

# Skip dataset discovery
./src/cli/catalog/discoverSocrata.ts --datasets=false

# Dry run with custom limits
./src/cli/catalog/discoverSocrata.ts --limit=1000 --dry-run
```

## Schema Implementation

### Database Tables

**Primary Dataset Storage**:
```sql
CREATE TABLE catalog.socrata_datasets (
  dataset_id TEXT NOT NULL,
  host TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  tags TEXT[],
  publisher TEXT,
  updated_at TIMESTAMPTZ,
  row_count BIGINT,
  view_count BIGINT,
  link TEXT,
  active BOOLEAN DEFAULT TRUE,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (host, dataset_id)
);
```

**Performance Indexes**:
- `idx_socrata_datasets_host` - Host-based queries
- `idx_socrata_datasets_category` - Category filtering  
- `idx_socrata_datasets_updated_desc` - Recent dataset discovery (DESC)
- `idx_socrata_datasets_active` - Active dataset filtering (partial index WHERE active = TRUE)
- `idx_socrata_datasets_host_active` - Composite for host+active filtering (partial index)

**Future Enhancements**:
- **Foreign Key Constraint**: Deferred until host registry stabilizes
  - Will link `catalog.socrata_datasets.host` → `catalog.socrata_hosts.host`  
  - Ensures referential integrity with CASCADE DELETE
- **Additional Indexes**: Monitor query patterns for optimization opportunities

## Verification Queries

### Top Hosts by Dataset Count
*Query executed after successful ingestion to validate distribution*

```sql
SELECT host, COUNT(*) as dataset_count 
FROM catalog.socrata_datasets 
WHERE active = TRUE 
GROUP BY host 
ORDER BY dataset_count DESC 
LIMIT 10;
```

**Sample Expected Results**:
```
data.sfgov.org: 1,247 datasets
data.cityofnewyork.us: 2,891 datasets  
data.seattle.gov: 456 datasets
data.austintexas.gov: 723 datasets
opendata.vancouver.ca: 334 datasets
```

### Recent High-Value Datasets
*Identifies datasets with significant row counts updated within 3 years*

```sql
SELECT dataset_id, host, title, row_count, updated_at 
FROM catalog.socrata_datasets 
WHERE updated_at >= NOW() - INTERVAL '3 years' 
  AND active = TRUE 
ORDER BY row_count DESC NULLS LAST 
LIMIT 10;
```

### SF Category Distribution
*Analysis of San Francisco's data categorization for planning*

```sql
SELECT category, COUNT(*) as count 
FROM catalog.socrata_datasets 
WHERE host = 'data.sfgov.org' 
  AND active = TRUE 
GROUP BY category 
ORDER BY count DESC 
LIMIT 10;
```

**Sample Expected Categories**:
- Finance: 89 datasets
- Transportation: 67 datasets  
- Housing and Buildings: 45 datasets
- Public Safety: 123 datasets
- Environment: 34 datasets

## Architecture Decisions

### Idempotent Processing
- **Resume Safety**: Pipeline can be restarted safely using `first_seen`/`last_seen` timestamps
- **Deduplication**: Primary key constraint on `(host, dataset_id)` prevents duplicates
- **Soft Deletes**: `active` flag allows dataset retirement without data loss
- **Batch Transactions**: 500-item batches balance performance with memory usage

### CLI Robustness
- **Argument Parsing**: Hardened with Zod schema validation
- **Environment Isolation**: No direct `process.env` access; uses secrets facade
- **Type Safety**: Full TypeScript coverage with strict mode
- **Error Handling**: Graceful degradation on API failures

### API Integration Patterns
- **Rate Limiting**: Natural throttling through sequential processing, no artificial delays
- **Error Handling**: Per-host failure isolation prevents cascade issues
- **Memory Management**: Streaming iteration prevents large dataset accumulation
- **Token Management**: Reuses existing Socrata app token infrastructure

### Kysely Integration Benefits
- **Type Safety**: Full TypeScript coverage for all database operations  
- **Query Builder**: Composable, reusable query patterns following existing codebase
- **Transaction Support**: ACID compliance for batch operations
- **Migration Compatibility**: Seamless integration with existing schema versioning

## Useful Dataset Heuristics (Next Phase)

Based on this registry foundation, subsequent filtering and prioritization should implement:

### Quality Indicators
- **Recency Filter**: `updated_at >= NOW() - INTERVAL '2 years'`
- **Size Threshold**: `row_count >= 100` (exclude metadata-only datasets)  
- **Activity Signal**: `view_count > 50` (community engagement indicator)

### Spam Mitigation
- **Publisher Patterns**: Exclude datasets where `publisher LIKE '%test%'`
- **Title Filtering**: Skip datasets with placeholder titles (`'Untitled'`, `'Dataset'`)
- **Duplicate Detection**: Cross-reference similar titles within host

### Priority Categories
1. **Finance**: Municipal budgets, expenditures, revenue
2. **Housing**: Building permits, assessments, housing programs
3. **Transportation**: Transit, parking, traffic, infrastructure
4. **Public Safety**: Incidents, inspections, emergency services
5. **Environment**: Air quality, waste, sustainability metrics

### Municipality Scoring
Rank municipalities by dataset portfolio quality:
```sql
SELECT 
  host,
  COUNT(*) as total_datasets,
  COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '2 years') as recent_datasets,
  AVG(row_count) FILTER (WHERE row_count > 0) as avg_row_count,
  ARRAY_AGG(DISTINCT category) FILTER (WHERE category IS NOT NULL) as categories
FROM catalog.socrata_datasets 
WHERE active = TRUE 
GROUP BY host
ORDER BY recent_datasets DESC, total_datasets DESC;
```

## Performance Characteristics

### Expected Metrics (Production Run)
- **Municipality Phase**: 2-5 minutes for US+EU regions
- **Dataset Phase**: 15-30 minutes depending on discovered host count
- **Database Load**: ~500 insert/update operations per second during batching
- **Memory Usage**: <100MB peak (streaming processing)
- **API Rate**: ~2 requests/second (natural throttling)

### Scaling Considerations
- **Parallelization**: Future optimization could process hosts concurrently
- **Incremental Updates**: Daily runs should focus on recently updated datasets
- **Archive Strategy**: Implement dataset retirement based on `last_seen` age
- **Index Maintenance**: Monitor query performance as dataset count grows

## Development & Testing

### Test Coverage
- **Repository Layer**: Idempotent upsert behaviors, retirement logic
- **CLI Parsing**: Flag validation, default handling, dry-run modes  
- **Integration**: Mock-based API testing with realistic fixtures
- **Performance**: Batch processing timing with fake timers

### Quality Gates
```bash
# Type checking
pnpm typecheck

# Linting  
pnpm lint

# Test execution
pnpm test tests/catalog.*

# Migration validation
./migrate.sh --dry-run
```

## Operational Runbook

### Daily Execution
```bash
# Standard discovery (municipalities + datasets)
./src/cli/catalog/discoverSocrata.ts

# Dataset-only refresh (faster incremental update)  
./src/cli/catalog/discoverSocrata.ts --limit=10000
```

### Monitoring Commands
```bash
# Check recent ingestion
SELECT host, MAX(last_seen) FROM catalog.socrata_datasets GROUP BY host;

# Validate data freshness
SELECT COUNT(*) FROM catalog.socrata_datasets WHERE last_seen >= NOW() - INTERVAL '1 day';

# Category distribution check
SELECT category, COUNT(*) FROM catalog.socrata_datasets WHERE active = TRUE GROUP BY category;
```

### Troubleshooting
- **Token Issues**: Verify `SOCRATA_APP_TOKEN` environment variable
- **Database Errors**: Check `DATABASE_URL` connectivity and schema permissions
- **Rate Limiting**: Socrata API limits are handled gracefully with error logging
- **Memory Issues**: Batch size can be reduced via code modification if needed

## Next Steps

1. **Production Deployment**: Schedule daily runs via cron/scheduler
2. **Quality Filtering**: Implement heuristics to identify high-value datasets  
3. **Municipality Ranking**: Score hosts by dataset portfolio quality
4. **Category Taxonomy**: Standardize category mappings across jurisdictions
5. **API Enhancement**: Expose dataset registry via `/v1/catalog/datasets` endpoint
6. **Vector Integration**: Prepare dataset descriptions for embedding generation