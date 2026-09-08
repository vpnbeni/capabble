"""Live end-to-end Himalyan collection tests — require network + PostgreSQL."""

import json
import os
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from school_intel.db.models import SchoolEnrollment, SchoolStudentDistribution, SourceRecord
from school_intel.domain.enums import DataSource, ValidationStatus
from school_intel.services.collection_service import KysCollectionService

FIXTURES = Path(__file__).parent / "fixtures" / "himalyan"
HIMALYAN_UDISE = "06140404094"
HIMALYAN_KYS_ID = "1519942"
HIMALYAN_STATE_CODE = "25299"


@pytest.fixture
def expected() -> dict:
    return json.loads((FIXTURES / "expected.json").read_text(encoding="utf-8"))


@pytest.fixture
def db_session() -> Session:
    url = os.environ.get("SCHOOL_INTEL_TEST_DATABASE_URL")
    if not url:
        pytest.skip("SCHOOL_INTEL_TEST_DATABASE_URL not set")
    engine = create_engine(url)
    with Session(engine) as session:
        yield session
        session.rollback()


@pytest.mark.live
def test_live_himalyan_collect_year_2020_21(db_session: Session, expected: dict) -> None:
    service = KysCollectionService(db_session)
    summary = service.collect_year(
        udise=HIMALYAN_UDISE,
        year="2020-21",
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )
    assert summary.enrollment_checks.get("2020-21") == expected["expected_enrollment_by_year"]["2020-21"]["total"]
    year_summary = next(y for y in summary.years if y.academic_year == "2020-21")
    assert year_summary.success_count == 8

    school_uuid = UUID(summary.school_id)
    enrollment = db_session.scalar(
        select(SchoolEnrollment).where(
            SchoolEnrollment.school_id == school_uuid,
            SchoolEnrollment.academic_year == "2020-21",
        )
    )
    assert enrollment is not None
    assert enrollment.total_enrollment == 413
    assert enrollment.rte_count == 0

    flag3 = db_session.scalar(
        select(SchoolStudentDistribution).where(
            SchoolStudentDistribution.school_id == school_uuid,
            SchoolStudentDistribution.academic_year == "2020-21",
            SchoolStudentDistribution.distribution_type == "getSocialData:3",
        )
    )
    assert flag3 is not None
    assert flag3.reported_total == 392
    assert flag3.validation_status == ValidationStatus.NON_RECONCILING.value

    source_count = db_session.scalar(
        select(func.count()).select_from(SourceRecord).where(SourceRecord.school_id == school_uuid)
    )
    assert source_count == 8
    db_session.commit()


@pytest.mark.live
def test_live_himalyan_collect_all_years(db_session: Session, expected: dict) -> None:
    service = KysCollectionService(db_session)
    summary = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )
    for year, values in expected["expected_enrollment_by_year"].items():
        assert summary.enrollment_checks.get(year) == values["total"]
    assert summary.overall_status == "complete"
    assert any("flag=3" in w for w in summary.validation_warnings)
    db_session.commit()
