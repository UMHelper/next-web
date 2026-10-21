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

npm run build:preview
npx opennextjs-cloudflare deploy --env preview
