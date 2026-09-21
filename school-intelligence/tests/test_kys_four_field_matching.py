"""Tests for SARAS ↔ KYS four-field matching (state, district, name, address)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from school_intel.domain.collection import AcademicYearMapping
from school_intel.domain.enums import (
    DataSource,
    IdentityMatchConfidence,
    KysMappingMethod,
    KysMappingStatus,
)
from school_intel.domain.kys_mapping import KysSearchCandidate
from school_intel.domain.schemas import SourceFetchResult
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.kys_four_field_matcher import KysFourFieldMatcher, SarasMappingFields
from school_intel.services.kys_mapping_resolver import KysMappingResolver
from school_intel.utils.text import (
    normalize_address_for_matching,
    normalize_school_name_for_matching,
)

AVN_SARAS = SarasMappingFields(
    state="Haryana",
    district="Jhajjar",
    school_name="A.V.N. GLOBAL SCHOOL",
    address_line="VILLAGE DOBH, ROHTAK, HARYANA-124001",
    pin_code="124001",
)

AVN_KYS = KysSearchCandidate(
    kys_school_id="1512345",
    udise="06140123456",
    school_name="AVN GLOBAL SCHOOL",
    state="Haryana",
    district="Jhajjar",
    address_line="VPO DOBH ROHTAK",
    pin_code="124001",
)


@pytest.fixture
def matcher() -> KysFourFieldMatcher:
    return KysFourFieldMatcher()


def test_exact_four_field_match(matcher: KysFourFieldMatcher) -> None:
    scored = matcher.match_candidates(AVN_SARAS, [AVN_KYS])
    assert len(scored) == 1
    assert scored[0].confidence == IdentityMatchConfidence.HIGH
    assert scored[0].method == KysMappingMethod.FOUR_FIELD_MATCH
    assert scored[0].kys_school_id == "1512345"


def test_punctuation_name_variation(matcher: KysFourFieldMatcher) -> None:
    assert normalize_school_name_for_matching("A.V.N. GLOBAL SCHOOL") == normalize_school_name_for_matching(
        "AVN GLOBAL SCHOOL"
    )
    score = matcher.score_pair(AVN_SARAS, AVN_KYS)
    assert score.accepted
    assert score.name_score >= 95.0


def test_address_formatting_variation(matcher: KysFourFieldMatcher) -> None:
    saras_addr = normalize_address_for_matching("VILLAGE DOBH, ROHTAK, HARYANA-124001")
    kys_addr = normalize_address_for_matching("VPO DOBH ROHTAK")
    assert "VPO" in saras_addr
    assert "DOBH" in saras_addr and "DOBH" in kys_addr
    score = matcher.score_pair(AVN_SARAS, AVN_KYS)
    assert score.address_score >= 50.0


def test_state_mismatch_rejected(matcher: KysFourFieldMatcher) -> None:
    wrong_state = KysSearchCandidate(
        kys_school_id="999",
        school_name="AVN GLOBAL SCHOOL",
        state="Punjab",
        district="Jhajjar",
        address_line="VPO DOBH ROHTAK",
    )
    score = matcher.score_pair(AVN_SARAS, wrong_state)
    assert score.rejected
    assert score.rejection_reason == "state_mismatch"
    assert matcher.match_candidates(AVN_SARAS, [wrong_state]) == []


def test_district_mismatch_rejected(matcher: KysFourFieldMatcher) -> None:
    wrong_district = KysSearchCandidate(
        kys_school_id="999",
        school_name="AVN GLOBAL SCHOOL",
        state="Haryana",
        district="Rohtak",
        address_line="VPO DOBH ROHTAK",
    )
    score = matcher.score_pair(AVN_SARAS, wrong_district)
    assert score.rejected
    assert score.rejection_reason == "district_mismatch"


def test_duplicate_school_names_review(matcher: KysFourFieldMatcher) -> None:
    dup_a = KysSearchCandidate(
        kys_school_id="111",
        school_name="AVN GLOBAL SCHOOL",
        state="Haryana",
        district="Jhajjar",
        address_line="VPO DOBH ROHTAK",
        pin_code="124001",
    )
    dup_b = KysSearchCandidate(
        kys_school_id="222",
        school_name="AVN GLOBAL SCHOOL",
        state="Haryana",
        district="Jhajjar",
        address_line="SECTOR 5 JHAJJAR",
        pin_code="124103",
    )
    scored = matcher.match_candidates(AVN_SARAS, [dup_a, dup_b])
    assert len(scored) >= 1
    high = [c for c in scored if c.confidence == IdentityMatchConfidence.HIGH]
    assert len(high) >= 1


def test_ambiguous_address_review(matcher: KysFourFieldMatcher) -> None:
    candidate = KysSearchCandidate(
        kys_school_id="333",
        school_name="AVN GLOBAL SCHOOL",
        state="Haryana",
        district="Jhajjar",
        address_line="UNKNOWN AREA FAR AWAY",
        pin_code="999999",
    )
    score = matcher.score_pair(AVN_SARAS, candidate)
    assert score.accepted
    assert score.confidence in {IdentityMatchConfidence.MEDIUM, IdentityMatchConfidence.LOW}


def test_weak_fuzzy_match_not_auto_mapped(matcher: KysFourFieldMatcher) -> None:
    weak = KysSearchCandidate(
        kys_school_id="444",
        school_name="TOTALLY DIFFERENT ACADEMY",
        state="Haryana",
        district="Jhajjar",
        address_line="OTHER PLACE",
    )
    scored = matcher.match_candidates(AVN_SARAS, [weak])
    assert scored == []


def test_high_confidence_single_candidate(matcher: KysFourFieldMatcher) -> None:
    scored = matcher.match_candidates(AVN_SARAS, [AVN_KYS])
    assert len(scored) == 1
    assert scored[0].confidence == IdentityMatchConfidence.HIGH


def test_verified_kys_candidate_persists_ids(pg_session) -> None:
    report = {
        "status": True,
        "data": {
            "schoolName": "AVN GLOBAL SCHOOL",
            "districtName": "Jhajjar",
            "stateName": "Haryana",
            "pincode": "124001",
            "udiseschCode": "06140123456",
            "yearDesc": "2025-26",
            "yearId": 12,
        },
    }
    profile = {"status": True, "data": {"address": "VPO DOBH ROHTAK"}}

    class _Collector:
        def fetch_identity_reference(self, school_id: str):
            latest = AcademicYearMapping(year_id=12, year_desc="2025-26", academic_year="2025-26")
            return (
                latest,
                [latest],
                SourceFetchResult(
                    raw_payload=report,
                    payload_checksum="r",
                    http_status=200,
                    fetched_at=datetime.now(timezone.utc),
                    endpoint="report-card",
                ),
                SourceFetchResult(
                    raw_payload=profile,
                    payload_checksum="p",
                    http_status=200,
                    fetched_at=datetime.now(timezone.utc),
                    endpoint="profile",
                ),
            )

        def close(self):
            pass

    repo = SchoolRepository(pg_session)
    school = repo.create_school(
        canonical_name="A.V.N. GLOBAL SCHOOL",
        district="Jhajjar",
        state="Haryana",
        pin_code="124001",
        address_line="VILLAGE DOBH, ROHTAK, HARYANA-124001",
    )
    resolver = KysMappingResolver(pg_session, collector=_Collector(), search_client=_NoSearch())
    result = resolver.confirm_manual_mapping(school.id, "1512345", method=KysMappingMethod.MANUAL_KYS_ID)
    assert result.status == KysMappingStatus.MAPPED
    assert result.udise == "06140123456"
    assert result.kys_school_id == "1512345"


def test_no_candidate_pending(pg_session) -> None:
    repo = SchoolRepository(pg_session)
    school = repo.create_school(
        canonical_name="A.V.N. GLOBAL SCHOOL",
        district="Jhajjar",
        state="Haryana",
        address_line="VILLAGE DOBH",
    )
    resolver = KysMappingResolver(pg_session, collector=_NoCollector(), search_client=_NoSearch())
    result = resolver.resolve(school.id)
    assert result.status == KysMappingStatus.PENDING
    assert "No KYS candidate dataset" in result.reason


class _NoSearch:
    def availability(self):
        from school_intel.collectors.kys_search_client import KysSearchAvailability

        return KysSearchAvailability(
            programmatic_search_available=False,
            reason="test: no KYS dataset",
            probed_paths=[],
        )

    def search(self, **kwargs):
        return []

    def close(self):
        pass


class _NoCollector:
    def close(self):
        pass


def test_resolver_with_injected_candidate_dataset(pg_session) -> None:
    class _InjectedSearch(_NoSearch):
        def availability(self):
            from school_intel.collectors.kys_search_client import KysSearchAvailability

            return KysSearchAvailability(
                programmatic_search_available=True,
                reason="test injected dataset",
                probed_paths=[],
            )

        def search(self, **kwargs):
            return [AVN_KYS]

    report = {
        "status": True,
        "data": {
            "schoolName": "AVN GLOBAL SCHOOL",
            "districtName": "Jhajjar",
            "stateName": "Haryana",
            "pincode": "124001",
            "udiseschCode": "06140123456",
            "yearDesc": "2025-26",
            "yearId": 12,
        },
    }
    profile = {"status": True, "data": {"address": "VPO DOBH ROHTAK"}}

    class _Collector:
        def fetch_identity_reference(self, school_id: str):
            latest = AcademicYearMapping(year_id=12, year_desc="2025-26", academic_year="2025-26")
            return (
                latest,
                [latest],
                SourceFetchResult(
                    raw_payload=report,
                    payload_checksum="r",
                    http_status=200,
                    fetched_at=datetime.now(timezone.utc),
                    endpoint="report-card",
                ),
                SourceFetchResult(
                    raw_payload=profile,
                    payload_checksum="p",
                    http_status=200,
                    fetched_at=datetime.now(timezone.utc),
                    endpoint="profile",
                ),
            )

        def close(self):
            pass

    repo = SchoolRepository(pg_session)
    school = repo.create_school(
        canonical_name="A.V.N. GLOBAL SCHOOL",
        district="Jhajjar",
        state="Haryana",
        pin_code="124001",
        address_line="VILLAGE DOBH, ROHTAK, HARYANA-124001",
    )
    resolver = KysMappingResolver(pg_session, collector=_Collector(), search_client=_InjectedSearch())
    result = resolver.resolve(school.id, persist=True)
    assert result.status == KysMappingStatus.MAPPED
    assert result.method == KysMappingMethod.FOUR_FIELD_MATCH
