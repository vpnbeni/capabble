#!/usr/bin/env bash
# Shared helpers for School Intelligence Postgres dump/restore scripts.
# Normalizes SQLAlchemy-style URLs for pg_dump / pg_restore / psql.

set -euo pipefail

db_url_to_pg() {
  local url="${1:-}"
  if [[ -z "$url" ]]; then
    echo ""
    return 0
  fi
  # Strip SQLAlchemy driver suffixes: postgresql+psycopg:// → postgresql://
  url="${url/postgresql+psycopg:\/\//postgresql:\/\/}"
  url="${url/postgresql+psycopg2:\/\//postgresql:\/\/}"
  url="${url/postgres+psycopg:\/\//postgresql:\/\/}"
  echo "$url"
}

db_require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' not found. Install PostgreSQL client tools (pg_dump, pg_restore, psql)." >&2
    exit 1
  fi
}

db_load_dotenv() {
  local env_file="${1:-}"
  if [[ -z "$env_file" || ! -f "$env_file" ]]; then
    return 0
  fi
  # Do not `source` .env — Neon URLs contain `&` which breaks the shell.
  while IFS= read -r line || [[ -n "$line" ]]; do
    # trim CR
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      if [[ "$val" =~ ^\"(.*)\"$ ]]; then
        val="${BASH_REMATCH[1]}"
      elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
        val="${BASH_REMATCH[1]}"
      fi
      export "$key=$val"
    fi
  done < "$env_file"
}

db_mask_url() {
  local url="$1"
  # Hide password between ://user: and @host
  echo "$url" | sed -E 's#(://[^:/?#]+:)[^@/?#]+@#\1***@#'
}

db_confirm_destructive() {
  local target_label="$1"
  local yes_flag="${2:-}"
  if [[ "$yes_flag" == "--yes" || "$yes_flag" == "-y" ]]; then
    return 0
  fi
  echo ""
  echo "WARNING: This will DESTROY existing data on: $target_label"
  echo "Type 'destroy' to continue:"
  read -r answer
  if [[ "$answer" != "destroy" ]]; then
    echo "Aborted."
    exit 1
  fi
}

db_verify_counts() {
  local url="$1"
  echo ""
  echo "Verification on $(db_mask_url "$url"):"
  psql "$url" -v ON_ERROR_STOP=1 <<'SQL'
SELECT COUNT(*) AS public_tables
FROM information_schema.tables
WHERE table_schema = 'public';
SQL

  psql "$url" -v ON_ERROR_STOP=0 -c "SELECT version_num AS alembic_version FROM alembic_version LIMIT 1;" 2>/dev/null || true
  psql "$url" -v ON_ERROR_STOP=0 -c "SELECT COUNT(*) AS schools FROM schools;" 2>/dev/null || true
}

db_dump_restore() {
  local source_url="$1"
  local dest_url="$2"
  local dump_file="$3"

  db_require_cmd pg_dump
  db_require_cmd pg_restore
  db_require_cmd psql

  echo "Dumping source → $dump_file"
  echo "  from $(db_mask_url "$source_url")"
  pg_dump "$source_url" -Fc --no-owner --no-acl -f "$dump_file"

  echo "Restoring into $(db_mask_url "$dest_url")"
  echo "Note: Neon pooler hosts can fail for restore; use the direct (non-pooler) connection if needed."

  # Prefer clean restore; fall back to schema wipe + restore if needed
  if ! pg_restore --no-owner --no-acl --clean --if-exists -d "$dest_url" "$dump_file"; then
    echo "pg_restore with --clean failed; wiping public schema and retrying..."
    psql "$dest_url" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    pg_restore --no-owner --no-acl -d "$dest_url" "$dump_file"
  fi

  db_verify_counts "$dest_url"
  echo "Done."
}
