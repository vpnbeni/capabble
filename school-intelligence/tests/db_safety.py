"""Hard guards preventing SCHOL tests from touching the production intelligence database."""

from __future__ import annotations

import os
from functools import wraps
from typing import Any, Callable, TypeVar

from sqlalchemy.engine import make_url
from sqlalchemy.engine.url import URL

# Production SCHOL database — tests must never run destructive or mutating fixtures here.
PROTECTED_DATABASE_NAMES: frozenset[str] = frozenset({"capabble_school_intel"})

# Default isolated database used when SCHOOL_INTEL_TEST_DATABASE_URL is not set.
DEFAULT_TEST_DATABASE_NAME = "capabble_school_intel_test"

F = TypeVar("F", bound=Callable[..., Any])


def database_name_from_url(database_url: str) -> str:
    """Return the PostgreSQL database name from a SQLAlchemy URL string."""
    return (make_url(database_url).database or "").lower()


def is_protected_database(database_url: str) -> bool:
    """True when the URL targets the production SCHOL database."""
    return database_name_from_url(database_url) in PROTECTED_DATABASE_NAMES


def require_isolated_test_database(database_url: str, *, context: str = "test") -> str:
    """
    Refuse URLs that point at the production SCHOL database.

    Raises RuntimeError when the database name is protected.
    """
    if not database_url or not database_url.strip():
        raise RuntimeError(f"{context}: database URL is empty")

    db_name = database_name_from_url(database_url)
    if db_name in PROTECTED_DATABASE_NAMES:
        raise RuntimeError(
            f"{context}: refusing to run against protected database '{db_name}'. "
            "Set SCHOOL_INTEL_TEST_DATABASE_URL to an isolated database "
            "(recommended: capabble_school_intel_test)."
        )
    return database_url


def resolve_test_database_url() -> str | None:
    """
    Resolve the isolated test database URL from the environment.

    When SCHOOL_INTEL_TEST_DATABASE_URL is unset, derives an isolated database
    name from SCHOOL_INTEL_DATABASE_URL (same host/credentials, different DB).

    Never returns a URL pointing at capabble_school_intel.
    """
    url = resolve_test_engine_url()
    if url is None:
        return None
    return url.render_as_string(hide_password=False)


def resolve_test_engine_url() -> URL | None:
    """
    Resolve a SQLAlchemy URL for the isolated pytest database.

    Returns None only when application database settings are unavailable.
    """
    raw = os.getenv("SCHOOL_INTEL_TEST_DATABASE_URL", "").strip()
    if raw:
        url = make_url(raw)
    else:
        from school_intel.config import get_settings

        url = make_url(get_settings().database_url).set(database=DEFAULT_TEST_DATABASE_NAME)

    rendered = url.render_as_string(hide_password=False)
    require_isolated_test_database(rendered, context="SCHOOL_INTEL_TEST_DATABASE_URL")
    return url


def configured_application_database_url() -> str:
    """Database URL used by the FastAPI backend, CLI, and Alembic migrations."""
    from school_intel.config import get_settings

    return get_settings().database_url


def database_names_match(left: str, right: str) -> bool:
    """Compare database names from two SQLAlchemy URL strings."""
    return database_name_from_url(left) == database_name_from_url(right)


def install_metadata_safety_guards() -> None:
    """
    Patch SQLAlchemy metadata helpers so tests cannot drop/create on production.

    Called once from tests/conftest.py at pytest startup.
    """
    from school_intel.db.base import Base

    if getattr(Base.metadata, "_schol_safety_installed", False):
        return

    original_drop_all = Base.metadata.drop_all
    original_create_all = Base.metadata.create_all

    def _bind_url(bind: Any) -> str:
        if bind is None:
            raise RuntimeError("Cannot determine database URL for metadata operation (bind is None)")
        return str(bind.url)

    @wraps(original_drop_all)
    def guarded_drop_all(*args: Any, **kwargs: Any) -> None:
        bind = kwargs.get("bind") or (args[0] if args else None)
        require_isolated_test_database(_bind_url(bind), context="Base.metadata.drop_all")
        raise RuntimeError(
            "Base.metadata.drop_all is forbidden in SCHOL tests. "
            "Use transaction rollback fixtures instead."
        )

    @wraps(original_create_all)
    def guarded_create_all(*args: Any, **kwargs: Any) -> None:
        bind = kwargs.get("bind") or (args[0] if args else None)
        require_isolated_test_database(_bind_url(bind), context="Base.metadata.create_all")
        return original_create_all(*args, **kwargs)

    Base.metadata.drop_all = guarded_drop_all  # type: ignore[method-assign]
    Base.metadata.create_all = guarded_create_all  # type: ignore[method-assign]
    Base.metadata._schol_safety_installed = True  # type: ignore[attr-defined]


def create_all_tables_for_tests(engine: Any) -> None:
    """Create ORM tables on an isolated test database only."""
    from school_intel.db.base import Base

    require_isolated_test_database(str(engine.url), context="test schema bootstrap")
    Base.metadata.create_all(engine)
