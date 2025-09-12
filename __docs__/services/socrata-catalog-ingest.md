# Socrata Catalog Ingestion Service

## Overview

The Socrata catalog ingestion service provides a structured interface for ingesting Socrata catalog metadata into the normalized database schema. This service operates across US and EU regions with configurable pagination, rate limiting, and dry-run capabilities.

## Current Interface (Task 66.1)

### Configuration
- `regions`: Array of regions to process ('US', 'EU')
- `pageSize`: Number of items per page for pagination
- `limit`: Maximum total items to process
- `dryRun`: When true, performs planning without actual ingestion
- `resumeFrom`: Optional cursor for resuming interrupted runs
- `logger`: Optional structured logger (defaults to console)
- `now`: Optional time provider for deterministic timestamps

### Validation & Error Handling
- Validates regions are non-empty and contain only 'US'|'EU'
- Validates pageSize and limit are positive integers
- Throws typed `SocrataCatalogIngestError` with 'CONFIG' or 'RUNTIME' codes
- Provides structured error context with cause information

### Current Behavior
Returns planning result with echoed configuration and timestamps. No network calls or database operations performed in Task 66.1.

## Future Capabilities

### Task 66.2: Pagination & Resume
- Implement cursor-based pagination through Socrata Discovery API
- Support resuming interrupted runs using stored cursors
- Handle cross-region state management

### Task 66.3: Rate Limiting & Backoff
- Exponential backoff with jitter for failed requests
- Configurable rate limits per region and endpoint
- Circuit breaker patterns for fault tolerance

### Task 66.4: Database Integration
- Idempotent upserts to normalized schema tables
- Batch processing for optimal database performance
- Transaction management and rollback capabilities

### Task 66.5: Logging & Monitoring
- Structured logging with correlation IDs
- Progress tracking and performance metrics
- Secret redaction for security compliance

### Task 66.6: Testing
- Comprehensive test suite with mocking
- Integration tests with test database
- Performance and load testing scenarios

## Resume & Idempotency (Task 66.4)

The catalog ingestion service now provides crash-safe progress tracking and idempotent writes through durable database state and transactional batch processing.

### Durable Resume State

Resume functionality persists progress in the `catalog.resume_state` table:

```sql
CREATE TABLE catalog.resume_state (
  pipeline TEXT PRIMARY KEY,        -- 'socrata_catalog' 
  resume_token TEXT,               -- Opaque JSON cursor
  last_processed_at TIMESTAMPTZ,  -- Last successful batch timestamp
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Token Lifecycle:**
1. **Load**: Service reads existing resume token from database on startup
2. **Process**: Items are accumulated into configurable batches
3. **Commit**: Each batch is persisted transactionally with updated resume token
4. **Recovery**: On restart, service resumes exactly where previous run left off

### Batch Processing

Items are processed in configurable batches (default: 100 items):

**Configuration Parameters:**
- `batchSize`: Number of items per batch (default: 100)
- `resumeEnabled`: Enable/disable resume functionality (default: true)

**Transaction Boundaries:**
- Each batch is processed as a single database transaction
- Resume token is updated atomically with the batch data
- On failure, entire batch is rolled back and resume token stays at previous safe point
- Subsequent restart resumes from last successful batch

### Idempotent Writes

Database operations use upsert semantics with natural keys:

**Idempotency Keys:**
- **Hosts**: `host` (primary key)
- **Domains**: `domain` (primary key) 
- **Agencies**: `host + name` (composite primary key)

**Behavior:**
- Duplicate items across batches result in no-op updates
- `last_seen` timestamps are updated on each occurrence
- Region and other metadata can be corrected on subsequent runs

### Failure Recovery Semantics

**Mid-batch Failure:**
```
Batch 1: [items 1-100] → ✅ Committed, resume_token = "processed:100"
Batch 2: [items 101-200] → ❌ Database error, transaction rolled back
Resume token remains: "processed:100"

On restart: Processing resumes from item 101
```

**Network/Process Crash:**
```
Processing items 150-152...
Process killed/network down

On restart: resume_token = "processed:100" (last successful batch)
Reprocessing items 101+ (idempotent upserts ensure no duplicates)
```

### Configuration Examples

**Standard Configuration:**
```typescript
const options = {
  regions: ['US', 'EU'],
  pageSize: 1000,
  limit: 50000,
  batchSize: 100,        // Process 100 items per transaction
  resumeEnabled: true,   // Enable durable resume
  dryRun: false
};
```

**High-throughput Configuration:**
```typescript
const options = {
  batchSize: 500,        // Larger batches for fewer DB roundtrips
  resumeEnabled: true,
  // ... other options
};
```

**Testing/Development Configuration:**
```typescript
const options = {
  batchSize: 10,         // Smaller batches for easier testing
  resumeEnabled: false,  // Disable resume for clean test runs
  dryRun: true          // Validate logic without side effects
};
```

### Monitoring & Logging

**Resume Events:**
- `resume_state_loaded`: Reports pipeline, timestamp, and token length
- `batch_committed`: Confirms successful batch with size and resume advancement
- `batch_rollback`: Reports failure with error and resume preservation

**Progress Tracking:**
- `total_processed`: Cumulative count across all runs (survives restarts)
- `batch_size`: Items in current batch for performance monitoring
- Resume token contains region and processed count for debugging