param(
  [string]$DbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

$ErrorActionPreference = "Stop"

Write-Host "Bootstrapping local database: $DbUrl"
psql $DbUrl -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql $DbUrl -v ON_ERROR_STOP=1 -f supabase/seed.sql
Write-Host "Local database bootstrap complete."
