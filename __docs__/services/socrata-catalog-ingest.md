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