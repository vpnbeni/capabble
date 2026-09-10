"""Tests for one-time SARAS re-enrichment on an existing collection run."""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from sqlalchemy import select

from school_intel.api.app import app
from school_intel.api.deps import get_db
from school_intel.db.models import CollectionRun, CollectionRunSchool, SarasSchoolRecord, School, SourceRecord
from school_intel.domain.enums import CollectionRunType, DataSource
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.saras_enrichment_service import SarasEnrichmentService

POSTAL_ADDRESS = "V&P.O. MADINA TEHSIL MEHAM, DISTT ROHTAK, HARYANA"


def _seed_source_record(pg_session, *, school_id, collection_run_id, suffix: str):
    record = SourceRecord(
        id=uuid4(),
        school_id=school_id,
        collection_run_id=collection_run_id,
        source=DataSource.SARAS.value,
        endpoint=f"directory:test:{suffix}",
        raw_payload={"html": "<test/>"},
        payload_checksum=f"checksum-{suffix}",
        idempotency_key=f"saras|test|{suffix}",
    )
    pg_session.add(record)
    pg_session.flush()
    return record.id


@pytest.fixture
def api_client(pg_session):
    def override_get_db() -> Generator:
        yield pg_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def partial_run_with_schools(pg_session):
    repo = SchoolRepository(pg_session)
    run = CollectionRun(
        id=uuid4(),
        run_type=CollectionRunType.BATCH.value,
        source=DataSource.SARAS.value,
        status="partial",
        parameters={"state_name": "HARYANA", "district_name": "ROHTAK"},
        total_count=2,
    )
    pg_session.add(run)
    pg_session.flush()

    items: list[CollectionRunSchool] = []
    for position, (name, aff) in enumerate(
        [
            ("ARYA SENIOR SECONDARY SCHOOL MADINA", "530656"),
            ("TEST PUBLIC SCHOOL ROHTAK", "530123"),
        ]
    ):
        school = repo.create_school(canonical_name=name, district="ROHTAK", state="HARYANA")
        item = CollectionRunSchool(
            id=uuid4(),
            collection_run_id=run.id,
            position=position,
            affiliation_number=aff,
            school_name=name,
            district="ROHTAK",
            state="HARYANA",
            school_id=school.id,
            planned_action="new",
            identity_status="identity_created",
            kys_mapping_status="unresolved",
            collection_status="kys_mapping_pending",
            saras_row={
                "detail_fields": {
                    "Postal Address": POSTAL_ADDRESS if position == 0 else "ROHTAK, HARYANA",
                }
            },
        )
        pg_session.add(item)
        items.append(item)

    pg_session.flush()
    return run, items


def test_re_enrich_run_backfills_address_from_stored_detail(
    partial_run_with_schools, pg_session
) -> None:
    run, items = partial_run_with_schools
    service = SarasEnrichmentService(pg_session, collector=MagicMock())

    report = service.re_enrich_run(run.id)

    assert report["total"] == 2
    assert report["enriched"] == 2
    assert len(report["schools"]) == 2
    assert report["schools"][0]["address_line"] == POSTAL_ADDRESS

    school = pg_session.get(School, items[0].school_id)
    assert school is not None
    assert school.address_line == POSTAL_ADDRESS
    assert items[0].kys_mapping_status == "unresolved"


def test_re_enrich_run_uses_live_fetch_false_when_detail_fields_present(
    partial_run_with_schools, pg_session
) -> None:
    run, _ = partial_run_with_schools
    service = SarasEnrichmentService(pg_session, collector=MagicMock())

    with patch.object(service, "enrich_run_school", wraps=service.enrich_run_school) as wrapped:
        service.re_enrich_run(run.id)
        assert wrapped.call_count == 2
        for call in wrapped.call_args_list:
            assert call.kwargs["live_fetch"] is False


def test_re_enrich_saras_api_endpoint(partial_run_with_schools, api_client, pg_session) -> None:
    run, items = partial_run_with_schools
    pg_session.commit()

    response = api_client.post(
        f"/api/collection/runs/{run.id}/re-enrich-saras",
        headers={"x-schol-role": "analyst"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == str(run.id)
    assert payload["total"] == 2
    assert payload["enriched"] == 2
    assert payload["schools"][0]["school_name"] == items[0].school_name


def test_re_enrich_saras_api_requires_role(partial_run_with_schools, api_client, pg_session) -> None:
    run, _ = partial_run_with_schools
    pg_session.commit()

    response = api_client.post(f"/api/collection/runs/{run.id}/re-enrich-saras")
    assert response.status_code == 403


def test_re_enrich_saras_api_run_not_found(api_client) -> None:
    missing_id = uuid4()
    response = api_client.post(
        f"/api/collection/runs/{missing_id}/re-enrich-saras",
        headers={"x-schol-role": "analyst"},
    )
    assert response.status_code == 404


def test_re_enrich_does_not_start_orchestrator(partial_run_with_schools, api_client, pg_session) -> None:
    run, _ = partial_run_with_schools
    pg_session.commit()

    with patch(
        "school_intel.api.routes.collection.BatchCollectionOrchestrator.start_run_async"
    ) as start_async:
        response = api_client.post(
            f"/api/collection/runs/{run.id}/re-enrich-saras",
            headers={"x-schol-role": "analyst"},
        )

    assert response.status_code == 200
    start_async.assert_not_called()


def test_re_enrich_run_updates_address_without_clearing_provenance(
    partial_run_with_schools, pg_session
) -> None:
    run, items = partial_run_with_schools
    source_ids = []
    for item in items:
        source_id = _seed_source_record(
            pg_session,
            school_id=item.school_id,
            collection_run_id=run.id,
            suffix=f"{item.affiliation_number}-dir",
        )
        detail_source_id = _seed_source_record(
            pg_session,
            school_id=item.school_id,
            collection_run_id=run.id,
            suffix=f"{item.affiliation_number}-detail",
        )
        source_ids.append((source_id, detail_source_id))
        pg_session.add(
            SarasSchoolRecord(
                id=uuid4(),
                affiliation_number=item.affiliation_number,
                school_name=item.school_name,
                normalized_name=item.school_name,
                school_id=item.school_id,
                source_record_id=source_id,
                detail_source_record_id=detail_source_id,
                parser_version="1.0.0",
                requires_manual_review=False,
            )
        )
    pg_session.flush()

    service = SarasEnrichmentService(pg_session, collector=MagicMock())
    report = service.re_enrich_run(run.id)
    pg_session.flush()

    assert report["enriched"] == 2
    for item, (source_id, detail_source_id) in zip(items, source_ids, strict=True):
        record = pg_session.scalar(
            select(SarasSchoolRecord).where(
                SarasSchoolRecord.affiliation_number == item.affiliation_number
            )
        )
        assert record is not None
        assert record.address_line is not None
        assert record.source_record_id == source_id
        assert record.detail_source_record_id == detail_source_id
        assert record.requires_manual_review is False
