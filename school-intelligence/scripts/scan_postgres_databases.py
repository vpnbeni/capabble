"""Scan all non-template PostgreSQL databases for schools table and run 83f109d9."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import create_engine, text

from school_intel.services.setup_service import read_env_database_url

RUN_ID = "83f109d9-43f5-4cb6-ae94-3b0f38e64743"


def main() -> None:
    base_url = read_env_database_url()
    admin_url = base_url.rsplit("/", 1)[0] + "/postgres"
    admin = create_engine(admin_url, future=True)
    with admin.connect() as conn:
        dbs = [r[0] for r in conn.execute(text(
            "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
        )).fetchall()]
    admin.dispose()

    print("Scanning databases on same PostgreSQL server...")
    for db in dbs:
        url = base_url.rsplit("/", 1)[0] + f"/{db}"
        engine = create_engine(url, future=True)
        try:
            with engine.connect() as conn:
                tables = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_name='schools'"
                )).scalar()
                if not tables:
                    print(f"  {db}: no schools table")
                    continue
                schools = conn.execute(text("SELECT COUNT(*) FROM schools")).scalar()
                runs = conn.execute(text("SELECT COUNT(*) FROM collection_runs")).scalar()
                run = conn.execute(
                    text("SELECT id FROM collection_runs WHERE id = :id"),
                    {"id": RUN_ID},
                ).fetchone()
                rev = None
                try:
                    rev = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
                except Exception:
                    rev = "N/A"
                print(
                    f"  {db}: schools={schools} runs={runs} run_83f109d9={'YES' if run else 'NO'} alembic={rev}"
                )
        except Exception as exc:
            print(f"  {db}: ERROR {exc}")
        finally:
            engine.dispose()


if __name__ == "__main__":
    main()
