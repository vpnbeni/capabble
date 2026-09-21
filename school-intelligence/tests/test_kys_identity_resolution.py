import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

from uuid import UUID

import pytest

from school_intel.collectors.kys_collector import KysCollector
from school_intel.domain.collection import AcademicYearMapping
from school_intel.domain.enums import DataSource, IdentifierType
from school_intel.domain.schemas import SourceFetchResult
from school_intel.parsers.kys_parser import KysParser
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.collection_service import KysCollectionService
from school_intel.services.school_identity_service import SchoolIdentityService

FIXTURES = Path(__file__).parent / "fixtures" / "himalyan"
HIMALYAN_UDISE = "06140404094"
HIMALYAN_KYS_ID = "1519942"
HIMALYAN_STATE_CODE = "25299"


@pytest.fixture
def identity_fixtures() -> tuple[dict, dict]:
    report = json.loads((FIXTURES / "identity_report_card.json").read_text(encoding="utf-8"))
    profile = json.loads((FIXTURES / "identity_profile.json").read_text(encoding="utf-8"))
    return report, profile


def test_is_placeholder_canonical_name() -> None:
    assert SchoolIdentityService.is_placeholder_canonical_name("UDISE 06140404094")
    assert SchoolIdentityService.is_placeholder_canonical_name("udise 123")
    assert not SchoolIdentityService.is_placeholder_canonical_name("HIMALYAN PUBLIC SCHOOL, ROHTAK")


def test_kys_parser_parse_school_identity(identity_fixtures: tuple[dict, dict]) -> None:
    report, profile = identity_fixtures
    parser = KysParser()
    identity = parser.parse_school_identity(
        report,
        profile,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
        academic_year="2025-26",
        year_id=12,
    )
    assert identity.canonical_name == "HIMALYAN PUBLIC SCHOOL, ROHTAK"
    assert identity.district == "Rohtak"
    assert identity.state == "Haryana"
    assert identity.pin_code == "124001"
    assert identity.udise == HIMALYAN_UDISE
    assert "HAFFED ROAD" in (identity.address_line or "")


class _FakeCollector:
    def __init__(self, report: dict, profile: dict) -> None:
        self._report = report
        self._profile = profile
        self.discover_calls = 0

    def discover_academic_years(self, school_id: str) -> list[AcademicYearMapping]:
        self.discover_calls += 1
        return [
            AcademicYearMapping(year_id=12, year_desc="2025-26", academic_year="2025-26"),
            AcademicYearMapping(year_id=7, year_desc="2020-21", academic_year="2020-21"),
        ]

    def fetch_identity_reference(self, school_id: str):
        latest = AcademicYearMapping(year_id=12, year_desc="2025-26", academic_year="2025-26")
        years = self.discover_academic_years(school_id)
        report = SourceFetchResult(
            raw_payload=self._report,
            payload_checksum="report",
            http_status=200,
            fetched_at=datetime.now(timezone.utc),
            endpoint="report-card",
        )
        profile = SourceFetchResult(
            raw_payload=self._profile,
            payload_checksum="profile",
            http_status=200,
            fetched_at=datetime.now(timezone.utc),
            endpoint="profile",
        )
        return latest, years, report, profile

    def annual_requests(self, *args, **kwargs):
        return []

    def close(self) -> None:
        return None


def _build_service(pg_session, report: dict, profile: dict) -> KysCollectionService:
    collector = _FakeCollector(report, profile)
    service = KysCollectionService(pg_session, collector=collector)
    service._collect_year = MagicMock(return_value=MagicMock(endpoints=[], academic_year="2025-26", year_id=12))  # type: ignore[method-assign]
    return service


def test_new_kys_school_creates_enriched_identity(pg_session, identity_fixtures: tuple[dict, dict]) -> None:
    report, profile = identity_fixtures
    service = _build_service(pg_session, report, profile)
    summary = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )

    repo = SchoolRepository(pg_session)
    school = repo.get_by_id(UUID(str(summary.school_id)))
    assert school is not None
    assert school.canonical_name == "HIMALYAN PUBLIC SCHOOL, ROHTAK"
    assert school.district == "Rohtak"
    assert school.state == "Haryana"
    assert school.pin_code == "124001"
    assert school.address_line is not None

    identifiers = {row.identifier_type: row.identifier_value for row in school.identifiers}
    assert identifiers[IdentifierType.UDISE.value] == HIMALYAN_UDISE
    assert identifiers[IdentifierType.KYS_SCHOOL_ID.value] == HIMALYAN_KYS_ID
    assert identifiers[IdentifierType.STATE_SCHOOL_CODE.value] == HIMALYAN_STATE_CODE
    assert IdentifierType.CBSE_AFFILIATION.value not in identifiers


def test_existing_placeholder_identity_is_enriched_not_duplicated(
    pg_session, identity_fixtures: tuple[dict, dict]
) -> None:
    report, profile = identity_fixtures
    repo = SchoolRepository(pg_session)
    placeholder = repo.create_school(canonical_name=f"UDISE {HIMALYAN_UDISE}")
    repo.upsert_identifier(
        placeholder.id,
        IdentifierType.UDISE.value,
        HIMALYAN_UDISE,
        DataSource.KYS.value,
        is_verified=True,
    )
    repo.upsert_identifier(
        placeholder.id,
        IdentifierType.KYS_SCHOOL_ID.value,
        HIMALYAN_KYS_ID,
        DataSource.KYS.value,
        is_verified=True,
    )
    repo.upsert_identifier(
        placeholder.id,
        IdentifierType.STATE_SCHOOL_CODE.value,
        HIMALYAN_STATE_CODE,
        DataSource.KYS.value,
        is_verified=True,
    )
    pg_session.flush()

    service = _build_service(pg_session, report, profile)
    summary = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )

    school = repo.get_by_id(placeholder.id)
    assert str(summary.school_id) == str(placeholder.id)
    assert school.canonical_name == "HIMALYAN PUBLIC SCHOOL, ROHTAK"
    assert school.district == "Rohtak"
    assert school.state == "Haryana"


def test_existing_populated_identity_is_not_degraded(pg_session, identity_fixtures: tuple[dict, dict]) -> None:
    report, profile = identity_fixtures
    repo = SchoolRepository(pg_session)
    existing = repo.create_school(
        canonical_name="HIMALYAN PUBLIC SCHOOL, ROHTAK",
        district="Rohtak",
        state="Haryana",
        pin_code="124001",
        address_line="EXISTING ADDRESS",
    )
    repo.upsert_identifier(existing.id, IdentifierType.UDISE.value, HIMALYAN_UDISE, DataSource.KYS.value)
    repo.upsert_identifier(existing.id, IdentifierType.KYS_SCHOOL_ID.value, HIMALYAN_KYS_ID, DataSource.KYS.value)
    pg_session.flush()

    service = _build_service(pg_session, report, profile)
    summary = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )

    school = repo.get_by_id(existing.id)
    assert str(summary.school_id) == str(existing.id)
    assert school.address_line == "EXISTING ADDRESS"


def test_repeated_collection_reuses_single_canonical_school(pg_session, identity_fixtures: tuple[dict, dict]) -> None:
    report, profile = identity_fixtures
    service = _build_service(pg_session, report, profile)
    first = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )
    second = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )
    assert first.school_id == second.school_id


def test_himalayan_identifiers_resolve_to_one_school(pg_session, identity_fixtures: tuple[dict, dict]) -> None:
    report, profile = identity_fixtures
    service = _build_service(pg_session, report, profile)
    summary = service.collect_school(
        udise=HIMALYAN_UDISE,
        kys_school_id=HIMALYAN_KYS_ID,
        state_school_code=HIMALYAN_STATE_CODE,
    )
    school_id = summary.school_id
    identity = SchoolIdentityService(pg_session)

    for id_type, value in [
        (IdentifierType.UDISE, HIMALYAN_UDISE),
        (IdentifierType.KYS_SCHOOL_ID, HIMALYAN_KYS_ID),
        (IdentifierType.STATE_SCHOOL_CODE, HIMALYAN_STATE_CODE),
    ]:
        found = identity.repo.find_identifier(id_type.value, value)
        assert found is not None
        assert str(found.school_id) == str(school_id)
