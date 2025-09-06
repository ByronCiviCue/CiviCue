#!/usr/bin/env bash
set -euo pipefail

# Load env if present
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=dev}"
: "${PGPASSWORD:=dev}"
: "${PGDATABASE:=civicue}"

echo "Running migrations against $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
PGPASSWORD="$PGPASSWORD" psql "host=$PGHOST port=$PGPORT user=$PGUSER dbname=$PGDATABASE" -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql
echo "✅ Migrations applied."