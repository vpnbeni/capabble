from __future__ import annotations

import uuid

import pytest

from sqlalchemy import select

from school_intel.db.models import School, SchoolEnrollment, SchoolIdentifier, SchoolStudentDistribution
from school_intel.domain.collection import EndpointCollectionStatus, SchoolCollectionSummary, YearCollectionSummary
from school_intel.domain.enums import (
    CollectionOutcomeStatus,
    DataQualityStatus,
    DataSource,
    IdentityStatus,
    IdentifierType,
    ValidationStatus,
)
from school_intel.services.validation_service import ValidationService
from tests.helpers.profile_seed import seed_himalyan_school


def _endpoint(status: str) -> EndpointCollectionStatus:
    return EndpointCollectionStatus(endpoint="getSocialData", status=status)


def test_compute_totals_treats_skipped_as_complete() -> None:
    summary = SchoolCollectionSummary(
        school_id="test",
        canonical_name="Test School",
        years=[
            YearCollectionSummary(
                academic_year="2020-21",
                year_id=7,
                endpoints=[_endpoint("skipped")] * 8,
            )
        ],
    )
    summary.compute_totals()
    assert summary.collection_status == CollectionOutcomeStatus.COMPLETE.value
    assert summary.total_skipped == 8
    assert summary.total_success == 0


def test_compute_totals_failed_when_all_endpoints_fail() -> None:
    summary = SchoolCollectionSummary(
        school_id="test",
        canonical_name="Test School",
        years=[
            YearCollectionSummary(
                academic_year="2020-21",
                year_id=7,
                endpoints=[_endpoint("failed")] * 8,
            )
        ],
    )
    summary.compute_totals()
    assert summary.collection_status == CollectionOutcomeStatus.FAILED.value


def test_validate_clean_school(pg_session) -> None:
    school = School(
        id=uuid.uuid4(),
        canonical_name="CLEAN PUBLIC SCHOOL",
        normalized_name="CLEAN PUBLIC SCHOOL",
        district="Rohtak",
        state="Haryana",
        validation_status="pending",
    )
    pg_session.add(school)
    pg_session.flush()
    for ident_type, value in [
        (IdentifierType.UDISE.value, "06140404095"),
        (IdentifierType.KYS_SCHOOL_ID.value, "9999999"),
    ]:
        pg_session.add(
            SchoolIdentifier(
                school_id=school.id,
                identifier_type=ident_type,
                identifier_value=value,
                source=DataSource.KYS.value,
            )
        )
    pg_session.add(
        SchoolEnrollment(
            school_id=school.id,
            academic_year="2025-26",
            source=DataSource.KYS.value,
            total_enrollment=100,
        )
    )
    pg_session.flush()

    report = ValidationService().validate_school(
        pg_session,
        school.id,
        collection_status=CollectionOutcomeStatus.COMPLETE.value,
    )

    assert report.collection_status == CollectionOutcomeStatus.COMPLETE
    assert report.identity_status == IdentityStatus.VERIFIED
    assert report.data_quality_status == DataQualityStatus.CLEAN
    assert report.validation_status == ValidationStatus.VALID
    assert school.data_quality["issue_count"] == 0


def test_validate_flag3_mismatch_is_warning_not_failed(pg_session) -> None:
    school_id = seed_himalyan_school(pg_session)
    pg_session.flush()

    report = ValidationService().validate_school(
        pg_session,
        school_id,
        collection_status=CollectionOutcomeStatus.COMPLETE.value,
    )

    assert report.collection_status == CollectionOutcomeStatus.COMPLETE
    assert report.identity_status == IdentityStatus.VERIFIED
    assert report.data_quality_status == DataQualityStatus.WARNING
    assert report.validation_status == ValidationStatus.VALID
    assert len(report.issues) == 1
    assert report.issues[0].severity == "warning"
    assert "2020-21" in report.issues[0].message
    assert "392" in report.issues[0].message
    assert "413" in report.issues[0].message

    school = pg_session.get(School, school_id)
    assert school.validation_status == ValidationStatus.VALID.value
    assert school.data_quality["issue_count"] == 1
    assert school.data_quality["data_quality_status"] == DataQualityStatus.WARNING.value


def test_validate_identity_unverified_for_placeholder_name(pg_session) -> None:
    school = School(
        id=uuid.uuid4(),
        canonical_name="UDISE 06140404094",
        normalized_name="UDISE 06140404094",
        validation_status="pending",
    )
    pg_session.add(school)
    pg_session.flush()
    pg_session.add(
        SchoolIdentifier(
            school_id=school.id,
            identifier_type=IdentifierType.UDISE.value,
            identifier_value="06140404094",
            source=DataSource.KYS.value,
        )
    )
    pg_session.add(
        SchoolIdentifier(
            school_id=school.id,
            identifier_type=IdentifierType.KYS_SCHOOL_ID.value,
            identifier_value="1519942",
            source=DataSource.KYS.value,
        )
    )
    pg_session.add(
        SchoolEnrollment(
            school_id=school.id,
            academic_year="2025-26",
            source=DataSource.KYS.value,
            total_enrollment=100,
        )
    )
    pg_session.flush()

    report = ValidationService().validate_school(
        pg_session,
        school.id,
        collection_status=CollectionOutcomeStatus.COMPLETE.value,
    )

    assert report.identity_status == IdentityStatus.UNVERIFIED
    assert report.validation_status == ValidationStatus.PARTIAL


def test_validate_missing_enrollment_marks_partial(pg_session) -> None:
    school = School(
        id=uuid.uuid4(),
        canonical_name="EMPTY PUBLIC SCHOOL",
        normalized_name="EMPTY PUBLIC SCHOOL",
        validation_status="pending",
    )
    pg_session.add(school)
    pg_session.flush()

    report = ValidationService().validate_school(
        pg_session,
        school.id,
        collection_status=CollectionOutcomeStatus.FAILED.value,
    )

    assert report.collection_status == CollectionOutcomeStatus.FAILED
    assert report.data_quality_status == DataQualityStatus.WARNING
    assert report.validation_status == ValidationStatus.FAILED
    assert report.issues[0].code == "missing_enrollment"


def test_himalayan_issue_count_matches_warning_messages(pg_session) -> None:
    school_id = seed_himalyan_school(pg_session)
    pg_session.flush()

    report = ValidationService().validate_school(
        pg_session,
        school_id,
        collection_status=CollectionOutcomeStatus.COMPLETE.value,
    )

    school = pg_session.get(School, school_id)
    assert school.data_quality["issue_count"] == len(report.issues)
    assert len(report.issues) == 1

    flag3 = pg_session.scalar(
        select(SchoolStudentDistribution).where(
            SchoolStudentDistribution.school_id == school_id,
            SchoolStudentDistribution.academic_year == "2020-21",
            SchoolStudentDistribution.distribution_type == "getSocialData:3",
        )
    )
    assert flag3.reported_total == 392
    assert flag3.validation_status == ValidationStatus.NON_RECONCILING.value
