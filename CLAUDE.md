# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the SF_Dashboard repository - a comprehensive data repository containing San Francisco municipal government data organized into various categories. The repository primarily contains data exports in CSV and JSON formats from various SF government sources.

## Data Architecture

### Primary Data Categories

- **311 Cases**: San Francisco 311 service requests and case data
- **Crime**: Police incident reports organized by year and district (2018-present)
- **Housing**: Multiple housing datasets including:
  - MOHCD Housing Pipeline data
  - Completed Housing Projects
  - Affordable Housing Pipeline
  - Housing Production data (2005-present)
  - San Francisco Development Pipeline
  - Rent Board Housing Inventory (often split into multiple parts due to size)
- **BOS Minutes**: Board of Supervisors meeting minutes and voting records
- **TABULATED BOS MEETING MINUTES**: Structured voting records by supervisor and date
- **Campaign Finance**: Campaign finance data
- **Contact Lobbyist Activity**: Lobbyist contact and activity records
- **Evictions**: Eviction data
- **Building Permits**: Building permit applications and approvals
- **Zoning**: Zoning district and map data
- **Behested Payments**: City behested payment records

### Data Organization Structure

```
SF_Dashboard/
├── Raw_Data/                     # Original raw data files (currently empty)
├── Cleaned_Data/                 # Processed/cleaned data (currently empty)
├── Staging_Data/                 # Intermediate processing data
├── SF_Dashboard_LatestExports/   # Most recent processed exports
├── Exports/                      # General exports directory
├── Exports_Queue/                # Data pending processing
├── Processed_Archive/            # Archived processed data
├── [Category folders]/           # Individual data category folders
│   ├── Archive/                  # Historical data
│   ├── By_Year/                  # Year-organized data (for time-series data)
│   └── [Specific datasets]       # Current working data
```

### Data File Naming Conventions

- JSON files: `[DatasetName]_YYYY-MM-DDTHH-mm-ss-sssZ.json`
- CSV files: `[category]_YYYY_[timeperiod].csv` or `[descriptive_name].csv`
- Large datasets may be split into parts: `filename_part1.json`, `filename_part2.json`, etc.
- Archives use descriptive names with dates: `[dataset]_archive_YYYY-MM-DD_HH_MM.json`

### Data Processing Notes

- **Large File Handling**: Many JSON files exceed 25,000 tokens and require careful handling with offset/limit parameters when reading
- **Rent Board Housing Inventory**: Consistently split into 15-20 parts due to size
- **Crime Data**: Organized by year and often by quarter for detailed analysis
- **BOS Data**: Structured with comprehensive voting records including individual supervisor positions

## Common Data Operations

### Reading Large Files
When working with large JSON files (most housing, crime, and BOS data), use:
```
Read tool with limit parameter (e.g., limit: 10-50 lines for initial inspection)
Grep tool for searching specific content within files
```

### Data Categories Quick Reference
- **Time Series Data**: Crime (by year/quarter), Housing Production, BOS Voting Records
- **Point-in-Time Data**: Building Permits, 311 Cases, Lobbyist Activities
- **Hierarchical Data**: Zoning (districts/maps), Development Pipeline (by status)
- **Relational Data**: Campaign Finance (candidates/contributions), Contact Lobbyist Activity

## File Types and Formats

### JSON Files
- Primary format for API exports and structured data
- Often contain arrays of records with consistent schemas
- May include metadata like timestamps, source information

### CSV Files
- Used for tabular data and voting records
- BOS voting records include individual supervisor vote columns
- Crime data organized with incident details, locations, categories

### Excel Files
- Limited use, primarily for staging data
- Found in Housing MOHCD pipeline archive

## Development Workflow

Since this is a data repository without traditional build/test commands:

### Data Analysis Tasks
1. **Data Exploration**: Use Read tool with limits to understand file structures
2. **Data Filtering**: Use Grep tool to search for specific records or patterns
3. **Cross-Dataset Analysis**: Reference data across categories (e.g., housing permits vs. crime data by district)

### Common Search Patterns
- Date ranges: `YYYY-MM-DD` format
- District references: Numbered districts (1-11 for supervisors)
- Status fields: "APPROVED", "PENDING", "COMPLETED" etc.
- Geographic data: Address fields, district mappings

## Data Quality Notes

- **Timestamps**: All JSON exports include ISO 8601 timestamps
- **Completeness**: Some datasets have known gaps (check archive folders for historical data)
- **Consistency**: Field names generally consistent within dataset categories but may vary between different SF departments
- **Updates**: Latest exports typically found in `SF_Dashboard_LatestExports/`

## Working with Specific Data Types

### Housing Data
- Multiple related datasets that can be cross-referenced
- Pipeline data shows projects in various stages
- Production data provides historical completion trends

### Crime Data
- Organized by district and time periods
- Large files often requiring systematic processing
- Geographic coordinates available for mapping

### BOS Voting Data
- Comprehensive voting records with individual supervisor positions
- Structured format ideal for voting pattern analysis
- Links between file numbers and legislative items