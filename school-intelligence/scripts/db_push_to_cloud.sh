#!/usr/bin/env bash
# Push local School Intelligence Postgres → cloud (SCHOOL_INTEL_CLOUD_DATABASE_URL).
# Usage (from repo root or school-intelligence/):
#   ./scripts/db_push_to_cloud.sh [--yes]
#   npm run school-intel:db:push-cloud -- --yes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/db_url_lib.sh"

YES_FLAG="${1:-}"

db_load_dotenv "$SI_ROOT/.env"

LOCAL_RAW="${SCHOOL_INTEL_DATABASE_URL:-}"
CLOUD_RAW="${SCHOOL_INTEL_CLOUD_DATABASE_URL:-}"

if [[ -z "$LOCAL_RAW" ]]; then
  echo "ERROR: SCHOOL_INTEL_DATABASE_URL is not set (local source)." >&2
  exit 1
fi
if [[ -z "$CLOUD_RAW" ]]; then
  echo "ERROR: SCHOOL_INTEL_CLOUD_DATABASE_URL is not set (cloud destination)." >&2
  echo "Add it to school-intelligence/.env (Neon URL with sslmode=require). Do not commit .env." >&2
  exit 1
fi

LOCAL_URL="$(db_url_to_pg "$LOCAL_RAW")"
CLOUD_URL="$(db_url_to_pg "$CLOUD_RAW")"

echo "=== School Intelligence: push local → cloud ==="
echo "Source: $(db_mask_url "$LOCAL_URL")"
echo "Dest:   $(db_mask_url "$CLOUD_URL")"

db_confirm_destructive "CLOUD database" "$YES_FLAG"

DUMP_FILE="$(mktemp -t schol_push.XXXXXX.dump)"
trap 'rm -f "$DUMP_FILE"' EXIT

db_dump_restore "$LOCAL_URL" "$CLOUD_URL" "$DUMP_FILE"
