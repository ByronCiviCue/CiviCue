# Socrata Directory Schema

## Overview

The normalized Socrata directory schema provides three related tables to track Socrata hosts, domains, and agencies in a structured way. This schema exists alongside the existing `catalog.socrata_municipality_index` table to support future data normalization.

## Tables

### catalog.socrata_hosts
- **Purpose**: Track unique Socrata host endpoints
- **Primary Key**: `host` (TEXT)
- **Columns**:
  - `host`: Socrata API hostname (e.g., "data.sfgov.org")
  - `region`: Geographic region ('US' | 'EU') 
  - `last_seen`: Timestamp of last discovery/verification
- **Indexes**: region, last_seen DESC

### catalog.socrata_domains
- **Purpose**: Track organization domains associated with Socrata instances
- **Primary Key**: `domain` (TEXT)  
- **Columns**:
  - `domain`: Organization domain (e.g., "sfgov.org")
  - `country`: ISO country code (optional)
  - `region`: Geographic region ('US' | 'EU')
  - `last_seen`: Timestamp of last discovery/verification
- **Indexes**: region, last_seen DESC

### catalog.socrata_agencies
- **Purpose**: Track government agencies/departments within each host
- **Primary Key**: `(host, name)` (composite)
- **Columns**:
  - `host`: Foreign key to socrata_hosts.host
  - `name`: Agency/department name
  - `type`: Optional categorization (department, office, etc.)
  - `created_at`: Initial discovery timestamp
- **Foreign Keys**: `host` → `catalog.socrata_hosts(host)` ON DELETE CASCADE
- **Indexes**: host, lower(name)

## Compatibility

### Compatibility View
A compatibility view `catalog.socrata_municipality_index_v` provides the same structure as the existing municipality index table but derives data from the normalized tables. This enables future migration of existing consumers.

### Dry-Run Support
Repository functions support dry-run mode via the `CIVICUE_DB_DRYRUN=1` environment variable. In dry-run mode, SQL queries are compiled but not executed, allowing safe testing of database operations.

## Migration Strategy
This schema is designed for gradual adoption:
1. New data ingestion can populate normalized tables
2. Existing consumers continue using municipality_index unchanged  
3. Future migration can switch consumers to use normalized structure
4. Legacy table can be retired once all consumers are migrated