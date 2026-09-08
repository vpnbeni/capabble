"""Read-only SCHOL database diagnosis. Does not migrate or modify anything."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

# Run from school-intelligence project root
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import create_engine, text

from school_intel.config import get_settings
from school_intel.db.session import get_engine
from school_intel.services.setup_service import ENV_PATH, PROJECT_ROOT, get_setup_status, read_env_database_url


def parse_db_url(url: str) -> dict:
    p = urlparse(url.replace("postgresql+psycopg://", "postgresql://"))
    return {
        "host": p.hostname,
        "port": p.port,
        "database": (p.path or "").lstrip("/"),
        "username": p.username,
    }


def main() -> None:
    settings = get_settings()
    env_url = read_env_database_url()
    configured_url = env_url or settings.database_url
    parsed = parse_db_url(configured_url)

    report: dict = {
        "env_loading": {
            "project_root": str(PROJECT_ROOT),
            "env_path": str(ENV_PATH),
            "env_file_exists": ENV_PATH.exists(),
            "cwd": os.getcwd(),
            "env_var_set_in_process": "SCHOOL_INTEL_DATABASE_URL" in os.environ,
            "resolved": parsed,
            "settings_url_matches_env_file": env_url == settings.database_url if env_url else None,
        },
        "setup_status": get_setup_status(),
    }

    engine = create_engine(configured_url, future=True)
    with engine.connect() as conn:
        report["session"] = {
            "current_database": conn.execute(text("SELECT current_database()")).scalar(),
            "current_user": conn.execute(text("SELECT current_user")).scalar(),
            "current_schema": conn.execute(text("SELECT current_schema()")).scalar(),
            "search_path": conn.execute(text("SHOW search_path")).scalar(),
            "version": conn.execute(text("SELECT version()")).scalar(),
        }

        try:
            rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
            report["alembic_version"] = [r[0] for r in rows]
        except Exception as exc:
            report["alembic_version"] = {"error": str(exc)}

        tables = [
            r[0]
            for r in conn.execute(
                text(
                    """
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    """
                )
            ).fetchall()
        ]
        report["tables"] = tables

        expected = [
            "schools",
            "school_identifiers",
            "source_records",
            "collection_runs",
            "collection_run_schools",
            "school_year_snapshots",
            "school_enrollment",
            "match_candidates",
            "kys_mapping_candidates",
            "alembic_version",
        ]
        report["expected_tables_present"] = {t: t in tables for t in expected}

        counts = {}
        for tbl in ["schools", "school_identifiers", "collection_runs", "collection_run_schools", "source_records"]:
            if tbl in tables:
                counts[tbl] = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
            else:
                counts[tbl] = None
        report["counts"] = counts

        if "collection_runs" in tables:
            run = conn.execute(
                text(
                    """
                    SELECT id, status, source, total_count, processed_count
                    FROM collection_runs
                    WHERE id = '83f109d9-43f5-4cb6-ae94-3b0f38e64743'
                    """
                )
            ).fetchone()
            report["run_83f109d9"] = dict(run._mapping) if run else None
            if run and "collection_run_schools" in tables:
                items = conn.execute(
                    text(
                        """
                        SELECT affiliation_number, school_name, school_id, kys_mapping_status, collection_status
                        FROM collection_run_schools
                        WHERE collection_run_id = '83f109d9-43f5-4cb6-ae94-3b0f38e64743'
                        ORDER BY position
                        """
                    )
                ).fetchall()
                report["run_83f109d9_schools"] = [dict(r._mapping) for r in items]

    # App engine (used by API routes via session_scope)
    app_engine = get_engine()
    app_url = str(app_engine.url)
    report["app_engine"] = {
        **parse_db_url(app_url),
        "same_as_configured": app_url == configured_url or parse_db_url(app_url) == parsed,
    }

    engine.dispose()

    # List other databases on same server (read-only)
    admin_url = configured_url.rsplit("/", 1)[0] + "/postgres"
    admin_engine = create_engine(admin_url, future=True)
    with admin_engine.connect() as conn:
        dbs = conn.execute(
            text("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
        ).fetchall()
        report["postgres_databases"] = [d[0] for d in dbs]
    admin_engine.dispose()

    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
