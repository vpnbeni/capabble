import pytest
from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from school_intel.db import models  # noqa: F401

from tests.db_safety import (
    create_all_tables_for_tests,
    install_metadata_safety_guards,
    resolve_test_engine_url,
)

load_dotenv()


def pytest_configure(config: pytest.Config) -> None:
    install_metadata_safety_guards()


@pytest.fixture(scope="session")
def pg_engine():
    database_url = resolve_test_engine_url()
    if database_url is None:
        pytest.skip(
            "Could not resolve an isolated SCHOL test database URL. "
            "Set SCHOOL_INTEL_TEST_DATABASE_URL or SCHOOL_INTEL_DATABASE_URL."
        )

    engine = create_engine(database_url, future=True)
    create_all_tables_for_tests(engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def pg_session(pg_engine):
    connection = pg_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):
        if trans.nested and not trans._parent.nested:
            connection.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
