#!/usr/bin/env bash
# Refuse to build the preview Worker unless the build-time environment is preview-safe.
# Locally these come from .env.preview.local (see deploy-preview.sh); in Cloudflare
# Workers Builds they must be set as build variables on next-web-preview.
set -euo pipefail

case "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" in
  pk_test_*) ;;
  *)
    echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk development key (pk_test_...)." >&2
    exit 1
    ;;
esac

if [ "${PREVIEW_DB_READONLY:-}" != "1" ]; then
  echo "PREVIEW_DB_READONLY must be 1 so the build cannot write to the production database." >&2
  exit 1
fi

: "${PREVIEW_MODE:?PREVIEW_MODE must be set}"
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL must be set}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set}"
: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY must be set}"
