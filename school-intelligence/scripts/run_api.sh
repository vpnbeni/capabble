#!/usr/bin/env bash
# Start School Intelligence API for local monorepo dev (port 8001).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${SCHOL_API_PORT:-8001}"

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="$(command -v python3)"
else
  PY="$(command -v python)"
fi

if ! "$PY" -c "import uvicorn" >/dev/null 2>&1; then
  echo "ERROR: uvicorn not found for: $PY" >&2
  echo "Create the School Intelligence venv once:" >&2
  echo "  cd school-intelligence && python3 -m venv .venv && .venv/bin/pip install -e \".[dev]\"" >&2
  exit 1
fi

# If a previous orphan is holding the port, free it so `npm run dev` can own schol-api.
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${PIDS:-}" ]]; then
    echo "Port $PORT is in use (pids: $PIDS). Stopping so school-intel:api can start..."
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
    sleep 0.4
    STILL="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${STILL:-}" ]]; then
      # shellcheck disable=SC2086
      kill -9 $STILL 2>/dev/null || true
      sleep 0.2
    fi
  fi
fi

echo "Starting SCHOL API on :$PORT with $PY"
exec "$PY" -m uvicorn school_intel.api.app:app --reload --host 127.0.0.1 --port "$PORT"
