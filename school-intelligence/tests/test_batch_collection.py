import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from school_intel.api.app import app
from school_intel.api.deps import get_db
from school_intel.domain.collection_constants import endpoints_for_groups, years_in_range
from school_intel.domain.enums import CollectionSchoolAction, IdentifierType
from school_intel.parsers.saras_parser import SarasParser
from school_intel.services.collection_assessment_service import CollectionAssessmentService
from school_intel.services.collection_preview_service import CollectionPreviewService

FIXTURES = Path(__file__).parent / "fixtures" / "saras"
HIMALAYAN_AFFILIATION = "530123"  # placeholder - use actual if in fixture


@pytest.fixture
def api_client():
    session = MagicMock()
    session.commit = MagicMock()
    session.flush = MagicMock()
    session.get = MagicMock(return_value=None)
    session.scalar = MagicMock(return_value=0)
    session.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client, session
    app.dependency_overrides.clear()


def test_years_in_range_includes_2018_19() -> None:
    years = years_in_range("2018-19", "2025-26")
    assert years[0] == "2018-19"
    assert len(years) == 8


def test_data_groups_map_to_endpoints() -> None:
    endpoints = endpoints_for_groups(["enrollment", "facilities"])
    assert "report-card" in endpoints
    assert "facility" in endpoints


def test_saras_parser_handles_directory_html() -> None:
    html = """
    <table id="myTable">
      <tr><th>S.No</th><th>Affiliation</th><th>Location</th><th>Status</th><th>School</th><th>Address</th><th>Action</th></tr>
      <tr>
        <td>1</td>
        <td>Aff. No. : 123456<br/>Sch. Code: 00001</td>
        <td>State : Haryana District : Rohtak</td>
        <td>Affiliated</td>
        <td>Name : TEST PUBLIC SCHOOL Head/Principal Name: PRINCIPAL</td>
        <td>Address : ROHTAK Website : www.test.com</td>
        <td><a href="/saras/AffiliatedList/AfflicationDetails/123456">View</a></td>
      </tr>
    </table>
    """
    parser = SarasParser()
    rows, errors = parser.parse_directory_html(html)
    assert len(rows) == 1
    assert rows[0].affiliation_number == "123456"
    assert rows[0].district == "Rohtak"
    assert errors == []


def test_preview_endpoint_requires_role(api_client) -> None:
    client, _ = api_client
    response = client.post(
        "/api/collection/preview",
        json={
            "source": "saras",
            "state_id": "5",
            "state_name": "Haryana",
            "district_id": "1",
            "district_name": "Rohtak",
        },
    )
    assert response.status_code == 403


def test_geography_states_endpoint(api_client) -> None:
    client, _ = api_client
    response = client.get("/api/geography/states", headers={"x-schol-role": "analyst"})
    assert response.status_code in {200, 502}


def test_saras_collector_parses_district_json() -> None:
    from school_intel.collectors.saras_collector import SarasCollector

    collector = SarasCollector()
    payload = '[{"value":"0","text":"--Select--"},{"value":"17","text":"ROHTAK"}]'
    districts = collector._parse_district_options(payload)
    assert districts == [{"id": "17", "name": "ROHTAK"}]
    collector.close()


def test_completed_run_summary_reports_processed_progress() -> None:
    from uuid import uuid4

    from school_intel.domain.collection_contract import pipeline_metadata_for_source
    from school_intel.domain.enums import BatchSchoolCollectionStatus, CollectionRunStatus, DataSource
    from school_intel.services.batch_collection_orchestrator import BatchCollectionOrchestrator

    run_id = uuid4()
    run = MagicMock()
    run.id = run_id
    run.status = CollectionRunStatus.PARTIAL.value
    run.source = DataSource.SARAS.value
    run.run_type = "batch"
    run.parameters = {
        "state_name": "HARYANA",
        "district_name": "ROHTAK",
        **pipeline_metadata_for_source(DataSource.SARAS.value),
    }
    run.total_count = 5
    run.processed_count = 5
    run.failed_count = 0
    run.started_at = None
    run.completed_at = None

    items = []
    for index in range(5):
        item = MagicMock()
        item.school_id = uuid4()
        item.identity_status = BatchSchoolCollectionStatus.IDENTITY_CREATED.value
        item.kys_mapping_status = "unresolved"
        item.collection_status = BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value
        item.validation_status = None
        item.years_complete = 0
        item.years_total = 0
        items.append(item)

    status_counts = {BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value: 5}
    summary = BatchCollectionOrchestrator.build_run_summary_payload(run, items, status_counts)

    assert summary["pipeline"] == "SARAS + KYS"
    assert summary["status"] == CollectionRunStatus.PARTIAL.value
    assert summary["total_count"] == 5
    assert summary["overall_percent"] == 0.0
    assert summary["status_counts"]["complete"] == 0
    assert summary["status_counts"]["kys_pending"] == 5
    assert summary["status_counts"]["remaining"] == 0
    assert summary["stage_progress"]["saras_discovery"] == {"complete": 5, "total": 5}
    assert summary["stage_progress"]["identity_resolution"] == {"complete": 5, "total": 5}
    assert summary["stage_progress"]["kys_mapping"] == {"complete": 0, "total": 5}
    assert summary["stage_progress"]["historical_collection"] == {"complete": 0, "total": 5}
    assert summary["stage_progress"]["validation"] == {"complete": 0, "total": 5}


def test_collection_preview_service_dedupes_affiliations(pg_session) -> None:
    collector = MagicMock()
    collector.fetch_district_directory.return_value = MagicMock(http_status=200, html="<table id='myTable'></table>")
    service = CollectionPreviewService(pg_session, collector=collector)
    service.parser.parse_directory_html = MagicMock(
        return_value=(
            [
                MagicMock(
                    affiliation_number="111111",
                    school_name="A",
                    school_code="1",
                    district="Rohtak",
                    state="Haryana",
                    status="Affiliated",
                    model_dump=lambda: {
                        "affiliation_number": "111111",
                        "school_name": "A",
                        "school_code": "1",
                        "district": "Rohtak",
                        "state": "Haryana",
                        "status": "Affiliated",
                    },
                ),
                MagicMock(
                    affiliation_number="111111",
                    school_name="A duplicate",
                    school_code="1",
                    district="Rohtak",
                    state="Haryana",
                    status="Affiliated",
                    model_dump=lambda: {
                        "affiliation_number": "111111",
                        "school_name": "A duplicate",
                        "school_code": "1",
                        "district": "Rohtak",
                        "state": "Haryana",
                        "status": "Affiliated",
                    },
                ),
            ],
            [],
        )
    )
    service.identity.preview_match = MagicMock(
        return_value=MagicMock(school_id=None, requires_manual_review=False, candidates=[], created=False)
    )
    result = service.preview(
        source="saras",
        state_id="5",
        state_name="Haryana",
        district_id="1",
        district_name="Rohtak",
    )
    assert result["schools_found"] == 2
    assert result["unique_schools"] == 1
    assert result["duplicates"] == 1
