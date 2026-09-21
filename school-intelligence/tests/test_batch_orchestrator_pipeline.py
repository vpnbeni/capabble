"""Batch orchestrator: SARAS detail → four-field KYS mapping → historical collection."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from school_intel.db.models import CollectionRunSchool
from school_intel.domain.enums import (
    BatchSchoolCollectionStatus,
    IdentityMatchConfidence,
    KysMappingMethod,
    KysMappingStatus,
)
from school_intel.domain.kys_mapping import KysMappingResult
from school_intel.services.batch_collection_orchestrator import BatchCollectionOrchestrator


def _run_item(**kwargs) -> CollectionRunSchool:
    return CollectionRunSchool(
        id=uuid4(),
        collection_run_id=uuid4(),
        position=0,
        affiliation_number=kwargs.get("affiliation_number", "123456"),
        school_name=kwargs.get("school_name", "TEST PUBLIC SCHOOL"),
        school_code=kwargs.get("school_code", "00001"),
        district=kwargs.get("district", "Rohtak"),
        state=kwargs.get("state", "Haryana"),
        school_id=kwargs.get("school_id", uuid4()),
        planned_action="new",
        identity_status=BatchSchoolCollectionStatus.IDENTITY_CREATED.value,
        kys_mapping_status=kwargs.get("kys_mapping_status", "pending"),
        collection_status=kwargs.get("collection_status", BatchSchoolCollectionStatus.DISCOVERED.value),
        saras_row={"address_line": "Main Road, Rohtak"},
        years_total=0,
        years_complete=0,
        year_progress=None,
        started_at=datetime.now(timezone.utc),
    )


def _mapped_result(school_id) -> KysMappingResult:
    return KysMappingResult(
        school_id=school_id,
        status=KysMappingStatus.MAPPED,
        kys_school_id="1512345",
        udise="06140123456",
        confidence=IdentityMatchConfidence.HIGH,
        method=KysMappingMethod.FOUR_FIELD_MATCH,
        candidate_count=1,
        persisted=True,
    )


@pytest.fixture
def orchestrator(pg_session) -> BatchCollectionOrchestrator:
    enricher = MagicMock()
    enricher.enrich_run_school.return_value = {"affiliation_number": "123456"}
    resolver = MagicMock()
    return BatchCollectionOrchestrator(
        pg_session,
        collector=MagicMock(),
        saras_enricher=enricher,
        kys_resolver=resolver,
    )


def test_saras_detail_then_four_field_mapping_before_history(orchestrator: BatchCollectionOrchestrator) -> None:
    item = _run_item()
    school_id = item.school_id
    orchestrator._kys_resolver.resolve.return_value = _mapped_result(school_id)

    with patch.object(orchestrator, "_resolve_kys_identifiers", return_value=("1512345", "06140123456")):
        with patch.object(orchestrator, "_collect_historical_kys") as collect_history:
            orchestrator._process_school_item(
                item, uuid4(), {"year_from": "2018-19", "year_to": "2025-26"}, resume_incomplete=True
            )

    orchestrator._saras_enricher.enrich_run_school.assert_called_once_with(item, live_fetch=True)
    orchestrator._kys_resolver.resolve.assert_called_once_with(school_id, persist=True)
    collect_history.assert_called_once()


def test_mapped_outcome_runs_historical_collection(orchestrator: BatchCollectionOrchestrator) -> None:
    item = _run_item()
    orchestrator._kys_resolver.resolve.return_value = _mapped_result(item.school_id)

    with patch.object(orchestrator, "_resolve_kys_identifiers", return_value=("1512345", "06140123456")):
        with patch.object(orchestrator, "_collect_historical_kys") as collect_history:
            orchestrator._process_school_item(
                item, uuid4(), {"year_from": "2018-19", "year_to": "2020-21"}, resume_incomplete=True
            )

    assert item.kys_mapping_status == "mapped"
    assert item.collection_status == BatchSchoolCollectionStatus.KYS_MAPPED.value
    collect_history.assert_called_once()


def test_review_outcome_skips_historical_collection(orchestrator: BatchCollectionOrchestrator) -> None:
    item = _run_item()
    orchestrator._kys_resolver.resolve.return_value = KysMappingResult(
        school_id=item.school_id,
        status=KysMappingStatus.REVIEW,
        candidate_count=2,
        reason="Multiple plausible KYS schools",
    )

    with patch.object(orchestrator, "_collect_historical_kys") as collect_history:
        orchestrator._process_school_item(
            item, uuid4(), {"year_from": "2018-19", "year_to": "2025-26"}, resume_incomplete=True
        )

    assert item.collection_status == BatchSchoolCollectionStatus.KYS_MAPPING_REVIEW.value
    assert item.kys_mapping_status == "pending"
    collect_history.assert_not_called()


def test_pending_outcome_skips_historical_collection(orchestrator: BatchCollectionOrchestrator) -> None:
    item = _run_item()
    orchestrator._kys_resolver.resolve.return_value = KysMappingResult(
        school_id=item.school_id,
        status=KysMappingStatus.PENDING,
        candidate_count=0,
        reason="No KYS candidate dataset available",
    )

    with patch.object(orchestrator, "_collect_historical_kys") as collect_history:
        orchestrator._process_school_item(
            item, uuid4(), {"year_from": "2018-19", "year_to": "2025-26"}, resume_incomplete=True
        )

    assert item.collection_status == BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value
    assert item.kys_mapping_status == "unresolved"
    collect_history.assert_not_called()


def test_already_mapped_skips_resolver_but_still_enriches_saras(orchestrator: BatchCollectionOrchestrator) -> None:
    item = _run_item(kys_mapping_status="mapped", collection_status=BatchSchoolCollectionStatus.KYS_MAPPED.value)

    with patch.object(orchestrator, "_resolve_kys_identifiers", return_value=("1512345", "06140123456")):
        with patch.object(orchestrator, "_collect_historical_kys") as collect_history:
            orchestrator._process_school_item(
                item, uuid4(), {"year_from": "2018-19", "year_to": "2025-26"}, resume_incomplete=True
            )

    orchestrator._saras_enricher.enrich_run_school.assert_called_once()
    orchestrator._kys_resolver.resolve.assert_not_called()
    collect_history.assert_called_once()


def test_production_kys_search_client_has_no_candidates() -> None:
    from school_intel.collectors.kys_search_client import KysSearchClient

    client = KysSearchClient()
    try:
        availability = client.availability()
        candidates = client.search(
            school_name="TEST SCHOOL",
            state="Haryana",
            district="Rohtak",
        )
        assert availability.programmatic_search_available is False
        assert candidates == []
    finally:
        client.close()
