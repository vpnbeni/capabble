"""Restore missing SCHOL application tables on capabble_school_intel without touching alembic_version.

Safe when alembic_version is already at head but tables were accidentally dropped.
Uses SQLAlchemy create_all(checkfirst=True) — creates only missing tables; never drops.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text

from school_intel.config import get_settings
from school_intel.db import models  # noqa: F401
from school_intel.db.base import Base

PRODUCTION_DATABASE = "capabble_school_intel"
EXPECTED_HEAD_REVISION = "0004_kys_mapping_candidates"


def main() -> int:
    load_dotenv(ROOT / ".env")
    settings = get_settings()
    engine = create_engine(settings.database_url, future=True)
    db_name = engine.url.database

    if db_name != PRODUCTION_DATABASE:
        print(
            json.dumps(
                {
                    "error": f"Refusing repair: expected database {PRODUCTION_DATABASE}, got {db_name}",
                },
                indent=2,
            )
        )
        return 1

    inspector = inspect(engine)
    before_tables = set(inspector.get_table_names(schema="public"))

    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if revision != EXPECTED_HEAD_REVISION:
            print(
                json.dumps(
                    {
                        "error": (
                            f"Unexpected alembic revision {revision}; "
                            f"expected {EXPECTED_HEAD_REVISION}. Repair aborted."
                        ),
                    },
                    indent=2,
                )
            )
            return 1

    missing_before = sorted(set(Base.metadata.tables) - before_tables)
    Base.metadata.create_all(engine, checkfirst=True)

    inspector = inspect(engine)
    after_tables = set(inspector.get_table_names(schema="public"))
    missing_after = sorted(set(Base.metadata.tables) - after_tables)
    restored = sorted(set(Base.metadata.tables) & (after_tables - before_tables))

    report = {
        "database": db_name,
        "alembic_revision": revision,
        "tables_before": sorted(before_tables),
        "missing_before": missing_before,
        "tables_restored": restored,
        "missing_after": missing_after,
        "tables_after_count": len(after_tables),
        "expected_model_tables": sorted(Base.metadata.tables.keys()),
    }
    print(json.dumps(report, indent=2))
    return 0 if not missing_after else 1


if __name__ == "__main__":
    raise SystemExit(main())
