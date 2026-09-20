#!/usr/bin/env bash
# Pull cloud School Intelligence Postgres → local (SCHOOL_INTEL_DATABASE_URL).
# Usage (from repo root or school-intelligence/):
#   ./scripts/db_pull_from_cloud.sh [--yes]
#   npm run school-intel:db:pull-cloud -- --yes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/db_url_lib.sh"

YES_FLAG="${1:-}"

db_load_dotenv "$SI_ROOT/.env"

LOCAL_RAW="${SCHOOL_INTEL_DATABASE_URL:-}"
CLOUD_RAW="${SCHOOL_INTEL_CLOUD_DATABASE_URL:-}"

if [[ -z "$CLOUD_RAW" ]]; then
  echo "ERROR: SCHOOL_INTEL_CLOUD_DATABASE_URL is not set (cloud source)." >&2
  exit 1
fi
if [[ -z "$LOCAL_RAW" ]]; then
  echo "ERROR: SCHOOL_INTEL_DATABASE_URL is not set (local destination)." >&2
  exit 1
fi

LOCAL_URL="$(db_url_to_pg "$LOCAL_RAW")"
CLOUD_URL="$(db_url_to_pg "$CLOUD_RAW")"

echo "=== School Intelligence: pull cloud → local ==="
echo "Source: $(db_mask_url "$CLOUD_URL")"
echo "Dest:   $(db_mask_url "$LOCAL_URL")"

db_confirm_destructive "LOCAL database" "$YES_FLAG"

DUMP_FILE="$(mktemp -t schol_pull.XXXXXX.dump)"
trap 'rm -f "$DUMP_FILE"' EXIT

db_dump_restore "$CLOUD_URL" "$LOCAL_URL" "$DUMP_FILE"
