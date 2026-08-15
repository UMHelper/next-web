#!/usr/bin/env bash

set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

echo "Bootstrapping local database: ${DB_URL}"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql "${DB_URL}" -v ON_ERROR_STOP=1 -f supabase/seed.sql

echo "Local database bootstrap complete."
