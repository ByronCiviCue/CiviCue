#!/usr/bin/env bash
set -euo pipefail
docker compose down -v || true
docker compose up -d