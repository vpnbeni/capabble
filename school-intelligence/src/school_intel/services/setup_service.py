from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from school_intel.cli.migrate import run_migrate
from school_intel.config import get_settings
from school_intel.db.models import School
from school_intel.db.session import reset_engine
from school_intel.services.collection_service import KysCollectionService

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = PROJECT_ROOT / ".env"
ENV_EXAMPLE_PATH = PROJECT_ROOT / ".env.example"

HIMALYAN_UDISE = "06140404094"
HIMALYAN_KYS_ID = "1519942"
HIMALYAN_STATE_CODE = "25299"


def setup_enabled() -> bool:
    return os.getenv("SCHOL_ALLOW_SETUP", "true").lower() in {"1", "true", "yes"}


def build_database_url(
    host: str,
    port: int,
    username: str,
    password: str,
    database: str,
) -> str:
    user = quote_plus(username.strip())
    pwd = quote_plus(password)
    db = database.strip()
    return f"postgresql+psycopg://{user}:{pwd}@{host.strip()}:{port}/{db}"


def mask_database_url(url: str) -> str:
    return re.sub(r":([^:@/]+)@", ":***@", url)


def read_env_database_url() -> str | None:
    if not ENV_PATH.exists():
        return None
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith("SCHOOL_INTEL_DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def write_env_database_url(database_url: str) -> None:
    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    updated = False
    new_lines: list[str] = []
    for line in lines:
        if line.startswith("SCHOOL_INTEL_DATABASE_URL="):
            new_lines.append(f"SCHOOL_INTEL_DATABASE_URL={database_url}")
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        if not new_lines and ENV_EXAMPLE_PATH.exists():
            new_lines = ENV_EXAMPLE_PATH.read_text(encoding="utf-8").splitlines()
            for idx, line in enumerate(new_lines):
                if line.startswith("SCHOOL_INTEL_DATABASE_URL="):
                    new_lines[idx] = f"SCHOOL_INTEL_DATABASE_URL={database_url}"
                    updated = True
                    break
        if not updated:
            new_lines.append(f"SCHOOL_INTEL_DATABASE_URL={database_url}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    os.environ["SCHOOL_INTEL_DATABASE_URL"] = database_url
    get_settings.cache_clear()
    reset_engine()


def _is_database_missing_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "database" in message and "does not exist" in message


def test_server_credentials(database_url: str) -> dict:
    from sqlalchemy.engine.url import make_url

    admin_url = make_url(database_url).set(database="postgres")
    engine = create_engine(admin_url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True, "message": "Server credentials are valid"}
    except Exception as exc:
        return {"ok": False, "message": str(exc)}
    finally:
        engine.dispose()


def test_database_connection(database_url: str) -> dict:
    from sqlalchemy.engine.url import make_url

    db_name = make_url(database_url).database
    engine = create_engine(database_url, pool_pre_ping=True, future=True)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "ok": True,
            "message": "Connection successful",
            "database_exists": True,
        }
    except Exception as exc:
        if _is_database_missing_error(exc):
            server = test_server_credentials(database_url)
            if server["ok"]:
                return {
                    "ok": True,
                    "message": (
                        f"Server credentials are valid. Database '{db_name}' does not exist yet "
                        "and will be created when you click Save & run migrations."
                    ),
                    "database_exists": False,
                    "database_will_be_created": True,
                }
            return {"ok": False, "message": server["message"], "database_exists": False}
        return {"ok": False, "message": str(exc), "database_exists": False}
    finally:
        engine.dispose()


def ensure_database_exists(database_url: str) -> dict:
    """Create the target database if the server is reachable but DB is missing."""
    from sqlalchemy.engine.url import make_url

    url = make_url(database_url)
    admin_url = url.set(database="postgres")
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    db_name = url.database
    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                return {"created": True, "database": db_name}
        return {"created": False, "database": db_name}
    finally:
        engine.dispose()


def run_migrations() -> dict:
    code = run_migrate()
    if code != 0:
        return {"ok": False, "message": "Migration failed. Check API logs for details."}
    return {"ok": True, "message": "Migrations applied successfully"}


def count_schools(session: Session) -> int:
    return session.scalar(select(func.count(School.id))) or 0


def collect_sample_school(session: Session) -> dict:
    service = KysCollectionService(session)
    summary = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
        verbose=False,
    )
    return {
        "ok": summary.overall_status == "complete",
        "school_name": summary.canonical_name,
        "udise": summary.udise,
        "overall_status": summary.overall_status,
        "validation_warnings": len(summary.validation_warnings),
    }


def get_setup_status(session: Session | None = None) -> dict:
    configured_url = read_env_database_url() or get_settings().database_url
    connection = test_database_connection(configured_url)
    school_count = None
    migrations_ok = False

    if connection["ok"]:
        try:
            if session is None:
                engine = create_engine(configured_url, pool_pre_ping=True, future=True)
                with Session(engine) as local_session:
                    school_count = count_schools(local_session)
                    local_session.execute(text("SELECT version_num FROM alembic_version"))
                    migrations_ok = True
                engine.dispose()
            else:
                school_count = count_schools(session)
                session.execute(text("SELECT version_num FROM alembic_version"))
                migrations_ok = True
        except Exception:
            migrations_ok = False

    return {
        "setup_enabled": setup_enabled(),
        "env_file_exists": ENV_PATH.exists(),
        "database_url_masked": mask_database_url(configured_url),
        "connection": connection,
        "migrations_ok": migrations_ok,
        "school_count": school_count,
    }
