import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from school_intel.db.base import Base
from school_intel.db import models  # noqa: F401


@pytest.fixture
def pg_session():
    import os

    database_url = os.getenv("SCHOOL_INTEL_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("SCHOOL_INTEL_TEST_DATABASE_URL not set")
    engine = create_engine(database_url, future=True)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
        session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
