"""KYS-only (kys_direct) batch collection create + process path."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import uuid4

from school_intel.db.models import CollectionRunSchool
from school_intel.domain.enums import BatchSchoolCollectionStatus, DataSource
from school_intel.services.batch_collection_orchestrator import BatchCollectionOrchestrator
from school_intel.services.kys_bulk_import_service import extract_kys_listing_rows, row_to_kys_candidate


SAMPLE_DISTRICT = {
    "data": {
        "content": [
            {
                "schoolId": 1510001,
                "udiseschCode": "06150100001",
                "schoolName": "GOVT SR SEC SCHOOL A",
                "districtName": "Jhajjar",
                "stateName": "Haryana",
                "pincode": "124103",
                "address": "Village A",
            },
            {
                "schoolId": 1510001,
                "udiseschCode": "06150100001",
                "schoolName": "GOVT SR SEC SCHOOL A DUP",
            },
            {
                "schoolId": 1510002,
                "udiseschCode": "06150100002",
                "schoolName": "GOVT SR SEC SCHOOL B",
                "districtName": "Jhajjar",
                "stateName": "Haryana",
            },
        ]
    }
}


def test_extract_kys_listing_rows_from_content_wrapper():
    rows = extract_kys_listing_rows(SAMPLE_DISTRICT)
    assert len(rows) == 3
    cand = row_to_kys_candidate(rows[0])
    assert cand is not None
    assert cand.kys_school_id == "1510001"
    assert cand.udise == "06150100001"
    assert cand.district == "Jhajjar"


def test_create_kys_direct_run_seeds_schools_without_db():
    session = MagicMock()
    run = MagicMock()
    run.id = uuid4()
    run.parameters = {}

    orchestrator = BatchCollectionOrchestrator(session, collector=MagicMock())
    orchestrator.run_repo = MagicMock()
    orchestrator.batch_repo = MagicMock()
    orchestrator.run_repo.create.return_value = run

    run_id = orchestrator._create_kys_direct_run(
        {
            "source": DataSource.KYS.value,
            "source_mode": "kys",
            "kys_district_json": SAMPLE_DISTRICT,
            "year_from": "2023-24",
            "year_to": "2023-24",
            "data_groups": ["enrollment", "school_profile"],
            "school_limit": "all",
            "options": {"skip_complete": True},
        },
        requested_by="tester",
    )

    assert run_id == run.id
    create_kwargs = orchestrator.run_repo.create.call_args.kwargs
    assert create_kwargs["source"] == DataSource.KYS.value
    params = create_kwargs["parameters"]
    assert params["pipeline_type"] == "kys_direct"
    assert params["district_name"] == "Jhajjar"
    assert params["state_name"] == "Haryana"
    assert params.get("kys_district_json") is None
    orchestrator.batch_repo.set_total_count.assert_called_once_with(run.id, 2)

    school_calls = orchestrator.batch_repo.create_run_school.call_args_list
    assert len(school_calls) == 2
    first = school_calls[0].kwargs
    assert first["kys_mapping_status"] == "mapped"
    assert first["affiliation_number"] == "06150100001"
    assert first["saras_row"]["kys_school_id"] == "1510001"
    second = school_calls[1].kwargs
    assert second["saras_row"]["kys_school_id"] == "1510002"


def test_create_kys_direct_run_respects_school_limit_without_db():
    session = MagicMock()
    run = MagicMock()
    run.id = uuid4()
    run.parameters = {}

    orchestrator = BatchCollectionOrchestrator(session, collector=MagicMock())
    orchestrator.run_repo = MagicMock()
    orchestrator.batch_repo = MagicMock()
    orchestrator.run_repo.create.return_value = run

    orchestrator._create_kys_direct_run(
        {
            "source": "kys",
            "source_mode": "kys",
            "kys_district_json": SAMPLE_DISTRICT,
            "year_from": "2023-24",
            "year_to": "2023-24",
            "data_groups": ["enrollment"],
            "school_limit": 1,
        }
    )
    orchestrator.batch_repo.set_total_count.assert_called_once_with(run.id, 1)
    assert orchestrator.batch_repo.create_run_school.call_count == 1


def test_process_kys_direct_item_skips_saras_and_collects():
    orchestrator = BatchCollectionOrchestrator(MagicMock(), collector=MagicMock())
    orchestrator.batch_repo = MagicMock()
    orchestrator.assessment = MagicMock()
    orchestrator.assessment.is_school_complete.return_value = False

    school_id = uuid4()
    item = CollectionRunSchool(
        id=uuid4(),
        collection_run_id=uuid4(),
        position=0,
        affiliation_number="06150100001",
        school_name="GOVT SR SEC SCHOOL A",
        district="Jhajjar",
        state="Haryana",
        planned_action="new",
        identity_status="new",
        kys_mapping_status="mapped",
        collection_status=BatchSchoolCollectionStatus.DISCOVERED.value,
        saras_row={
            "kys_school_id": "1510001",
            "udise": "06150100001",
            "schoolId": 1510001,
            "udiseschCode": "06150100001",
        },
        years_total=0,
        years_complete=0,
        started_at=datetime.now(timezone.utc),
    )

    fake_school = MagicMock()
    fake_school.id = school_id

    with (
        patch(
            "school_intel.services.batch_collection_orchestrator.KysCollectionService"
        ) as service_cls,
        patch.object(orchestrator, "_collect_historical_kys") as collect,
        patch.object(orchestrator, "_enrich_saras_detail") as enrich,
        patch.object(orchestrator, "_resolve_kys_mapping") as resolve_map,
        patch("school_intel.services.batch_collection_orchestrator.KysCollector"),
    ):
        service_cls.return_value._resolve_school.return_value = (fake_school, "1510001")
        orchestrator._process_kys_direct_item(
            item,
            item.collection_run_id,
            {
                "source": "kys",
                "pipeline_type": "kys_direct",
                "year_from": "2023-24",
                "year_to": "2023-24",
                "data_groups": ["enrollment"],
            },
            resume_incomplete=True,
        )

        enrich.assert_not_called()
        resolve_map.assert_not_called()
        collect.assert_called_once()
        assert item.school_id == school_id
        assert item.kys_mapping_status == "mapped"
