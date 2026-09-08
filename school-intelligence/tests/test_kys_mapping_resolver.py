import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from school_intel.collectors.kys_search_client import KysSearchAvailability, is_valid_kys_school_id
from school_intel.domain.collection import AcademicYearMapping
from school_intel.domain.enums import (
    DataSource,
    IdentifierType,
    IdentityMatchConfidence,
    KysMappingMethod,
    KysMappingStatus,
)
from school_intel.domain.kys_mapping import KysSearchCandidate
from school_intel.domain.schemas import SchoolIdentifierInput, SourceFetchResult
from school_intel.parsers.kys_parser import KysParser
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.kys_mapping_resolver import KysMappingResolver
from school_intel.services.school_identity_service import SchoolIdentityService

FIXTURES = Path(__file__).parent / "fixtures" / "himalyan"
HIMALYAN_UDISE = "06140404094"
HIMALYAN_KYS_ID = "1519942"
TEST_KYS_ID = "9900001"
TEST_UDISE = "06140999999"


def _school_identity_payload(name: str, district: str, pin: str, udise: str) -> tuple[dict, dict]:
    report = {
        "status": True,
        "data": {
            "schoolName": name,
            "districtName": district,
            "stateName": "Haryana",
            "pincode": pin,
            "udiseschCode": udise,
            "yearDesc": "2025-26",
            "yearId": 12,
        },
    }
    profile = {"status": True, "data": {"address": f"{name} Campus"}}
    return report, profile


@pytest.fixture
def identity_fixtures() -> tuple[dict, dict]:
    report = json.loads((FIXTURES / "identity_report_card.json").read_text(encoding="utf-8"))
    profile = json.loads((FIXTURES / "identity_profile.json").read_text(encoding="utf-8"))
    return report, profile


class _FakeSearchClient:
    def __init__(self, candidates: list[KysSearchCandidate] | None = None) -> None:
        self._candidates = candidates or []

    def availability(self) -> KysSearchAvailability:
        return KysSearchAvailability(
            programmatic_search_available=bool(self._candidates),
            reason="test",
            probed_paths=[],
        )

    def search(self, **kwargs) -> list[KysSearchCandidate]:
        return list(self._candidates)

    def close(self) -> None:
        return None


class _FakeCollector:
    def __init__(self, report: dict, profile: dict, *, fail: bool = False) -> None:
        self._report = report
        self._profile = profile
        self._fail = fail

    def fetch_identity_reference(self, school_id: str):
        if self._fail:
            raise ValueError(f"No academic years discovered for KYS school {school_id}")
        latest = AcademicYearMapping(year_id=12, year_desc="2025-26", academic_year="2025-26")
        years = [latest]
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

    def close(self) -> None:
        return None


def _seed_school(pg_session, name: str = "A.V.N. GLOBAL SCHOOL", **kwargs) -> tuple:
    repo = SchoolRepository(pg_session)
    school = repo.create_school(
        canonical_name=name,
        district=kwargs.get("district", "Jhajjar"),
        state=kwargs.get("state", "Haryana"),
        pin_code=kwargs.get("pin_code", "124001"),
        address_line=kwargs.get("address_line", "Main Road"),
    )
    return school, repo


def test_existing_kys_school_id_mapped(pg_session) -> None:
    school, repo = _seed_school(pg_session, name="TEST KYS MAPPED SCHOOL", district="Rohtak")
    repo.ensure_verified_identifier(
        school.id, IdentifierType.KYS_SCHOOL_ID.value, TEST_KYS_ID, DataSource.KYS.value
    )
    repo.ensure_verified_identifier(
        school.id, IdentifierType.UDISE.value, TEST_UDISE, DataSource.KYS.value
    )
    report, profile = _school_identity_payload("TEST KYS MAPPED SCHOOL", "Rohtak", "124001", TEST_UDISE)
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient(),
    )
    result = resolver.resolve(school.id)
    assert result.status == KysMappingStatus.MAPPED
    assert result.method == KysMappingMethod.EXISTING_IDENTIFIER
    assert result.kys_school_id == TEST_KYS_ID


def test_existing_udise_without_kys_stays_pending(pg_session) -> None:
    school, repo = _seed_school(pg_session)
    repo.ensure_verified_identifier(
        school.id, IdentifierType.UDISE.value, HIMALYAN_UDISE, DataSource.KYS.value
    )
    resolver = KysMappingResolver(pg_session, collector=MagicMock(), search_client=_FakeSearchClient())
    result = resolver.resolve(school.id)
    assert result.status == KysMappingStatus.PENDING
    assert result.kys_school_id is None


def test_no_identifiers_pending(pg_session) -> None:
    school, _repo = _seed_school(pg_session)
    resolver = KysMappingResolver(pg_session, collector=MagicMock(), search_client=_FakeSearchClient())
    result = resolver.resolve(school.id)
    assert result.status == KysMappingStatus.PENDING
    assert result.candidate_count == 0


def test_saras_code_not_state_school_code(pg_session) -> None:
    school, repo = _seed_school(pg_session)
    identity = SchoolIdentityService(pg_session)
    identity.attach_identifiers(
        school.id,
        [
            SchoolIdentifierInput(
                identifier_type=IdentifierType.SARAS_SCHOOL_CODE,
                identifier_value="41866",
                source=DataSource.SARAS,
                is_verified=True,
            )
        ],
    )
    refreshed = repo.get_by_id(school.id)
    types = {i.identifier_type for i in refreshed.identifiers}
    assert IdentifierType.SARAS_SCHOOL_CODE.value in types
    assert IdentifierType.STATE_SCHOOL_CODE.value not in types
    assert IdentifierType.KYS_SCHOOL_ID.value not in types
    assert IdentifierType.UDISE.value not in types


def test_saras_code_never_treated_as_kys_id(pg_session) -> None:
    school, repo = _seed_school(pg_session)
    repo.upsert_identifier(
        school.id,
        IdentifierType.SARAS_SCHOOL_CODE.value,
        "41866",
        DataSource.SARAS.value,
        is_verified=True,
    )
    resolver = KysMappingResolver(pg_session, collector=MagicMock(), search_client=_FakeSearchClient())
    result = resolver.resolve(school.id)
    assert result.kys_school_id != "41866"
    assert result.status == KysMappingStatus.PENDING


def test_manual_kys_id_verified_before_save(pg_session) -> None:
    school, _repo = _seed_school(
        pg_session,
        name="TEST MANUAL VERIFY SCHOOL",
        district="Rohtak",
        state="Haryana",
        pin_code="124001",
        address_line="TEST MANUAL VERIFY SCHOOL Campus",
    )
    report, profile = _school_identity_payload("TEST MANUAL VERIFY SCHOOL", "Rohtak", "124001", TEST_UDISE)
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient(),
    )
    verification = resolver.verify_kys_id(school.id, TEST_KYS_ID)
    assert verification.verdict == "verified"
    result = resolver.confirm_manual_mapping(
        school.id, TEST_KYS_ID, method=KysMappingMethod.MANUAL_KYS_ID
    )
    assert result.status == KysMappingStatus.MAPPED
    assert result.persisted is True
    assert result.udise == TEST_UDISE


def test_invalid_kys_id_rejected(pg_session) -> None:
    school, _repo = _seed_school(pg_session)
    resolver = KysMappingResolver(pg_session, collector=MagicMock(), search_client=_FakeSearchClient())
    verification = resolver.verify_kys_id(school.id, "not-a-number")
    assert verification.verdict == "invalid"
    result = resolver.confirm_manual_mapping(school.id, "not-a-number")
    assert result.status != KysMappingStatus.MAPPED


def test_kys_identity_mismatch_review_not_mapped(pg_session, identity_fixtures) -> None:
    report, profile = identity_fixtures
    school, _repo = _seed_school(pg_session, name="COMPLETELY DIFFERENT SCHOOL", district="Mumbai")
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient(),
    )
    verification = resolver.verify_kys_id(school.id, HIMALYAN_KYS_ID)
    assert verification.verdict in {"review", "rejected"}
    result = resolver.confirm_manual_mapping(school.id, HIMALYAN_KYS_ID)
    assert result.status != KysMappingStatus.MAPPED


def test_one_high_confidence_candidate_mapped(pg_session) -> None:
    school, _repo = _seed_school(
        pg_session,
        name="A.V.N. GLOBAL SCHOOL",
        district="Jhajjar",
        state="Haryana",
        pin_code="124001",
        address_line="VILLAGE DOBH, ROHTAK, HARYANA-124001",
    )
    report, profile = _school_identity_payload("AVN GLOBAL SCHOOL", "Jhajjar", "124001", TEST_UDISE)
    profile["data"]["address"] = "VPO DOBH ROHTAK"
    candidate = KysSearchCandidate(
        kys_school_id=TEST_KYS_ID,
        udise=TEST_UDISE,
        school_name="AVN GLOBAL SCHOOL",
        state="Haryana",
        district="Jhajjar",
        pin_code="124001",
        address_line="VPO DOBH ROHTAK",
    )
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient([candidate]),
    )
    result = resolver.resolve(school.id, persist=True)
    assert result.status == KysMappingStatus.MAPPED
    assert result.method == KysMappingMethod.FOUR_FIELD_MATCH


def test_multiple_candidates_review(pg_session) -> None:
    school, _repo = _seed_school(
        pg_session,
        name="A.V.N. GLOBAL SCHOOL",
        district="Jhajjar",
        state="Haryana",
        address_line="VILLAGE DOBH, ROHTAK",
    )
    candidates = [
        KysSearchCandidate(
            kys_school_id="111",
            school_name="AVN GLOBAL SCHOOL",
            state="Haryana",
            district="Jhajjar",
            address_line="VPO DOBH ROHTAK",
            pin_code="124001",
        ),
        KysSearchCandidate(
            kys_school_id="222",
            school_name="AVN GLOBAL SCHOOL",
            state="Haryana",
            district="Jhajjar",
            address_line="VPO DOBH ROHTAK",
            pin_code="124001",
        ),
    ]
    resolver = KysMappingResolver(
        pg_session,
        collector=MagicMock(),
        search_client=_FakeSearchClient(candidates),
    )
    result = resolver.resolve(school.id)
    assert result.status == KysMappingStatus.REVIEW
    assert result.candidate_count == 2


def test_no_candidate_pending(pg_session) -> None:
    school, _repo = _seed_school(pg_session)
    resolver = KysMappingResolver(pg_session, collector=MagicMock(), search_client=_FakeSearchClient())
    result = resolver.resolve(school.id)
    assert result.status == KysMappingStatus.PENDING


def test_resolver_idempotent(pg_session) -> None:
    kys_id = "9900011"
    udise = "06140990011"
    school, repo = _seed_school(
        pg_session,
        name="TEST IDEMPOTENT SCHOOL",
        district="Rohtak",
        state="Haryana",
        pin_code="124001",
        address_line="TEST IDEMPOTENT SCHOOL Campus",
    )
    report, profile = _school_identity_payload("TEST IDEMPOTENT SCHOOL", "Rohtak", "124001", udise)
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient(),
    )
    first = resolver.confirm_manual_mapping(school.id, kys_id)
    second = resolver.resolve(school.id)
    assert first.persisted is True
    assert second.status == KysMappingStatus.MAPPED
    assert second.method == KysMappingMethod.EXISTING_IDENTIFIER
    kys_ids = [
        i.identifier_value
        for i in repo.get_by_id(school.id).identifiers
        if i.identifier_type == IdentifierType.KYS_SCHOOL_ID.value
    ]
    assert kys_ids == [kys_id]


def test_verified_mapping_not_overwritten(pg_session) -> None:
    school, repo = _seed_school(
        pg_session,
        name="TEST NO OVERWRITE SCHOOL",
        district="Rohtak",
        state="Haryana",
        pin_code="124001",
        address_line="TEST NO OVERWRITE SCHOOL Campus",
    )
    report, profile = _school_identity_payload("TEST NO OVERWRITE SCHOOL", "Rohtak", "124001", TEST_UDISE)
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient(),
    )
    resolver.confirm_manual_mapping(school.id, TEST_KYS_ID)
    weaker = resolver.confirm_manual_mapping(school.id, "9999998")
    assert weaker.status == KysMappingStatus.MAPPED
    assert weaker.kys_school_id == TEST_KYS_ID
    assert weaker.persisted is False


def test_successful_verification_stores_udise(pg_session) -> None:
    kys_id = "9900022"
    udise = "06140990022"
    school, repo = _seed_school(
        pg_session,
        name="TEST UDISE STORE SCHOOL",
        district="Rohtak",
        state="Haryana",
        pin_code="124001",
        address_line="TEST UDISE STORE SCHOOL Campus",
    )
    report, profile = _school_identity_payload("TEST UDISE STORE SCHOOL", "Rohtak", "124001", udise)
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient(),
    )
    resolver.confirm_manual_mapping(school.id, kys_id)
    refreshed = repo.get_by_id(school.id)
    udise_row = next(i for i in refreshed.identifiers if i.identifier_type == IdentifierType.UDISE.value)
    assert udise_row.identifier_value == udise
    assert udise_row.is_verified is True


def test_no_duplicate_schools_created(pg_session) -> None:
    from school_intel.db.models import School

    school, repo = _seed_school(pg_session, name="TEST NO DUP SCHOOL", district="Rohtak")
    report, profile = _school_identity_payload("TEST NO DUP SCHOOL", "Rohtak", "124001", TEST_UDISE)
    resolver = KysMappingResolver(
        pg_session,
        collector=_FakeCollector(report, profile),
        search_client=_FakeSearchClient(),
    )
    before = pg_session.query(School).count()
    resolver.confirm_manual_mapping(school.id, TEST_KYS_ID)
    resolver.confirm_manual_mapping(school.id, TEST_KYS_ID)
    after = pg_session.query(School).count()
    assert before == after


def test_is_valid_kys_school_id() -> None:
    assert is_valid_kys_school_id("1519942")
    assert not is_valid_kys_school_id("abc")


def test_run_partial_until_kys_collection_complete() -> None:
    from school_intel.domain.collection_contract import derive_run_status
    from school_intel.domain.enums import BatchSchoolCollectionStatus, CollectionRunStatus

    statuses = [BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value] * 5
    assert (
        derive_run_status(statuses, current_status=CollectionRunStatus.RUNNING.value)
        == CollectionRunStatus.PARTIAL.value
    )
