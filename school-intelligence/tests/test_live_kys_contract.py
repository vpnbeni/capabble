"""Live KYS API contract tests — opt-in via pytest -m live."""

import pytest

from school_intel.collectors.endpoints import KYS_API_BASE, SOCIAL_DATA
from school_intel.collectors.kys_collector import KysCollector

HIMALYAN_KYS_ID = "1519942"


@pytest.fixture
def collector() -> KysCollector:
    c = KysCollector()
    yield c
    c.close()


@pytest.mark.live
def test_kys_report_card_returns_json(collector: KysCollector) -> None:
    result = collector.fetch_report_card(HIMALYAN_KYS_ID, 7)
    assert result.http_status == 200
    assert collector.is_api_success(result.raw_payload, result.http_status)
    data = result.raw_payload["data"]
    assert data["yearDesc"] == "2020-21"
    assert data["udiseschCode"] == "06140404094"


@pytest.mark.live
def test_kys_social_data_flag1_enrollment(collector: KysCollector) -> None:
    result = collector.fetch_social_data(HIMALYAN_KYS_ID, 7, 1)
    assert result.http_status == 200
    assert collector.is_api_success(result.raw_payload, result.http_status)
    total = result.raw_payload["data"]["schEnrollmentYearDataTotal"]
    assert total["finalTotal"] == 413


@pytest.mark.live
def test_kys_social_data_flag3_age_distribution(collector: KysCollector) -> None:
    result = collector.fetch_social_data(HIMALYAN_KYS_ID, 7, 3)
    assert result.http_status == 200
    assert collector.is_api_success(result.raw_payload, result.http_status)
    total = result.raw_payload["data"]["schEnrollmentYearDataTotal"]
    assert total["finalTotal"] == 392


@pytest.mark.live
def test_kys_year_discovery(collector: KysCollector) -> None:
    years = collector.discover_academic_years(HIMALYAN_KYS_ID)
    year_map = {y.academic_year: y.year_id for y in years}
    assert year_map.get("2020-21") == 7
    assert year_map.get("2025-26") == 12
    assert "2019-20" in year_map


@pytest.mark.live
def test_kys_get_social_data_requires_flag(collector: KysCollector) -> None:
    """getSocialData without flag returns API error (not HTTP 404)."""
    response = collector._request_with_retry(
        f"{KYS_API_BASE}/{SOCIAL_DATA}",
        {"schoolId": HIMALYAN_KYS_ID, "yearId": 7},
    )
    payload = response.json()
    assert response.status_code == 200
    assert payload.get("status") is False
