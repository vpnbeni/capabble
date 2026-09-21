from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from school_intel.db.session import session_scope
from school_intel.services.setup_service import (
    build_database_url,
    collect_sample_school,
    ensure_database_exists,
    get_setup_status,
    run_migrations,
    setup_enabled,
    mask_database_url,
    test_database_connection,
    write_env_database_url,
)

router = APIRouter(prefix="/api/setup", tags=["setup"])


class DatabaseConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 5432
    username: str = "postgres"
    password: str = ""
    database: str = "capabble_school_intel"


def _require_setup_enabled() -> None:
    if not setup_enabled():
        raise HTTPException(status_code=403, detail="Developer setup is disabled in this environment")


@router.get("/status")
def setup_status() -> dict:
    _require_setup_enabled()
    try:
        with session_scope() as session:
            return get_setup_status(session)
    except Exception:
        return get_setup_status()


@router.post("/test-connection")
def test_connection(config: DatabaseConfig) -> dict:
    _require_setup_enabled()
    database_url = build_database_url(
        config.host, config.port, config.username, config.password, config.database
    )
    return {
        "database_url_masked": mask_database_url(database_url),
        **test_database_connection(database_url),
    }


@router.post("/configure-and-migrate")
def configure_and_migrate(config: DatabaseConfig) -> dict:
    _require_setup_enabled()
    database_url = build_database_url(
        config.host, config.port, config.username, config.password, config.database
    )

    connection = test_database_connection(database_url)
    if not connection["ok"]:
        raise HTTPException(status_code=400, detail=connection["message"])

    db_result = ensure_database_exists(database_url)
    write_env_database_url(database_url)
    migration = run_migrations()
    status = get_setup_status()

    return {
        "saved": True,
        "database": db_result,
        "migration": migration,
        "status": status,
    }


@router.post("/reset-password")
def reset_database_password(config: DatabaseConfig) -> dict:
    """Update the stored PostgreSQL password without re-running migrations."""
    _require_setup_enabled()
    database_url = build_database_url(
        config.host, config.port, config.username, config.password, config.database
    )

    connection = test_database_connection(database_url)
    if not connection["ok"]:
        raise HTTPException(status_code=400, detail=connection["message"])

    write_env_database_url(database_url)
    status = get_setup_status()

    return {
        "ok": True,
        "message": "Database password updated successfully",
        "status": status,
    }


@router.post("/collect-sample")
def collect_sample() -> dict:
    _require_setup_enabled()
    try:
        with session_scope() as session:
            result = collect_sample_school(session)
            status = get_setup_status(session)
            return {"collection": result, "status": status}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
