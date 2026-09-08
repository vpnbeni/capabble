from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from school_intel.api.app import app
from school_intel.api.deps import get_db
from school_intel.services.profile_service import ProfileService
from tests.helpers.profile_seed import seed_himalyan_school


@pytest.fixture
def api_client(pg_session):
    def override_get_db() -> Generator:
        yield pg_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_profile_api_himalyan_golden(pg_session) -> None:
    school_id = seed_himalyan_school(pg_session)
    pg_session.commit()

    service = ProfileService(pg_session)
    profile = service.build_profile(school_id)

    assert profile["header"]["identifiers"]["udise"] == "06140404094"
    assert profile["header"]["identifiers"]["state_school_code"] == "25299"
    assert profile["header"]["identifiers"]["kys_school_id"] == "1519942"
    assert profile["header"]["identifiers"]["cbse_affiliation"] is None

    overview = profile["overview"]
    assert overview["students"] == 222
    assert overview["teachers"] == 13
    assert overview["student_teacher_ratio"] == 17.08

    trend = overview["enrollment_trend"]
    assert trend["percentage_change"] == -50.0
    assert trend["consecutive_declines"] == 6
    assert trend["totals"] == [444, 413, 395, 316, 286, 240, 222]

    staff_totals = [row["total"] for row in profile["staff"]["series"]]
    assert staff_totals == [11, 10, 10, 10, 10, 12, 13]

    assert len(profile["data_quality"]) == 1
    issue = profile["data_quality"][0]
    assert issue["year"] == "2020-21"
    assert issue["reported_enrollment"] == 413
    assert issue["distribution_total"] == 392
    assert issue["difference"] == 21


def test_profile_http_endpoint(api_client, pg_session) -> None:
    school_id = seed_himalyan_school(pg_session)
    pg_session.commit()

    response = api_client.get(f"/api/schools/{school_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["overview"]["students"] == 222


def test_raw_data_requires_role(api_client, pg_session) -> None:
    school_id = seed_himalyan_school(pg_session)
    pg_session.commit()

    denied = api_client.get(f"/api/schools/{school_id}/raw")
    assert denied.status_code == 403

    allowed = api_client.get(f"/api/schools/{school_id}/raw", headers={"x-schol-role": "analyst"})
    assert allowed.status_code == 200
    assert "records" in allowed.json()


def test_school_not_found(api_client) -> None:
    response = api_client.get("/api/schools/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
