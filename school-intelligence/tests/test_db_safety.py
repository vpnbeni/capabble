"""Tests for SCHOL database safety guards."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine

from school_intel.config import get_settings
from school_intel.db.base import Base
from school_intel.db.session import get_engine, reset_engine

from tests.db_safety import (
    DEFAULT_TEST_DATABASE_NAME,
    PROTECTED_DATABASE_NAMES,
    configured_application_database_url,
    create_all_tables_for_tests,
    database_name_from_url,
    database_names_match,
    is_protected_database,
    require_isolated_test_database,
    resolve_test_database_url,
    resolve_test_engine_url,
)


def test_protected_database_names_include_production() -> None:
    assert "capabble_school_intel" in PROTECTED_DATABASE_NAMES


def test_is_protected_database_detects_production_url() -> None:
    url = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel"
    assert is_protected_database(url) is True


def test_is_protected_database_allows_test_url() -> None:
    url = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel_test"
    assert is_protected_database(url) is False


def test_require_isolated_test_database_rejects_production() -> None:
    url = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel"
    with pytest.raises(RuntimeError, match="protected database"):
        require_isolated_test_database(url, context="unit test")


def test_drop_all_blocked_on_production_bind() -> None:
    engine = create_engine(
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel"
    )
    with pytest.raises(RuntimeError, match="drop_all is forbidden|protected database"):
        Base.metadata.drop_all(engine)
    engine.dispose()


def test_create_all_blocked_on_production_bind() -> None:
    engine = create_engine(
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel"
    )
    with pytest.raises(RuntimeError, match="protected database"):
        Base.metadata.create_all(engine)
    engine.dispose()


def test_create_all_tables_for_tests_rejects_production() -> None:
    engine = create_engine(
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel"
    )
    with pytest.raises(RuntimeError, match="protected database"):
        create_all_tables_for_tests(engine)
    engine.dispose()


def test_resolve_test_database_url_derives_isolated_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SCHOOL_INTEL_TEST_DATABASE_URL", raising=False)
    monkeypatch.setenv(
        "SCHOOL_INTEL_DATABASE_URL",
        "postgresql+psycopg://postgres:secret@127.0.0.1:5432/capabble_school_intel",
    )
    get_settings.cache_clear()
    url = resolve_test_engine_url()
    assert url is not None
    assert database_name_from_url(str(url)) == DEFAULT_TEST_DATABASE_NAME
    assert database_name_from_url(str(url)) not in PROTECTED_DATABASE_NAMES


def test_resolve_test_database_url_rejects_production_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "SCHOOL_INTEL_TEST_DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel",
    )
    with pytest.raises(RuntimeError, match="protected database"):
        resolve_test_database_url()


def test_backend_cli_and_alembic_share_settings_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    configured = "postgresql+psycopg://postgres:secret@127.0.0.1:5432/capabble_school_intel"
    monkeypatch.setenv("SCHOOL_INTEL_DATABASE_URL", configured)
    get_settings.cache_clear()
    reset_engine()

    settings_url = get_settings().database_url
    session_engine_url = str(get_engine().url)

    assert database_names_match(settings_url, configured_application_database_url())
    assert database_names_match(settings_url, session_engine_url)
    assert database_name_from_url(settings_url) == "capabble_school_intel"

    reset_engine()
    get_settings.cache_clear()
