#!/usr/bin/env bash
# Build and deploy the preview Worker (next-web-preview).
# Reads build-time values from .env.preview.local (git-ignored). Runtime secrets
# are set separately with `wrangler secret put <NAME> --env preview`.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.preview.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. See docs/preview-worker.md and the Preview worker section of .env.example." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

case "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" in
  pk_test_*) ;;
  *)
    echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk development key (pk_test_...)." >&2
    exit 1
    ;;
esac

if [ "${PREVIEW_DB_READONLY:-}" != "1" ]; then
  echo "PREVIEW_DB_READONLY must be 1 in $ENV_FILE so the build cannot write to the production database." >&2
  exit 1
fi

: "${PREVIEW_MODE:?PREVIEW_MODE must be set in $ENV_FILE}"
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL must be set in $ENV_FILE}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in $ENV_FILE}"
: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY must be set in $ENV_FILE}"

npx opennextjs-cloudflare build --env preview
npx opennextjs-cloudflare deploy --env preview
