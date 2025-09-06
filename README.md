# CiviCue Data Pipeline

This project implements a comprehensive data pipeline for San Francisco municipal data, facilitating the flow from CSV files and Google Sheets into a structured Postgres database with landing, staging, and core layers, followed by reverse ETL back to Google Sheets for analysis and reporting.

**Project Status: Greenfield init**

## Local DB

- Start: `docker compose up -d`
- Reset: `./scripts/resetDb.sh`
- Connect: `psql -h localhost -p 5432 -U dev -d civicue`