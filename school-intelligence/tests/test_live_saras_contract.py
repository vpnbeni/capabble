"""Live SARAS contract tests — opt-in via pytest -m live."""

import pytest

from school_intel.collectors.saras_collector import SarasCollector
from school_intel.parsers.saras_parser import SarasParser


@pytest.fixture
def collector() -> SarasCollector:
    c = SarasCollector()
    yield c
    c.close()


@pytest.mark.live
def test_saras_form_tokens(collector: SarasCollector) -> None:
    tokens = collector.refresh_form_tokens()
    assert tokens["__RequestVerificationToken"]
    assert tokens["__ncforminfo"]


@pytest.mark.live
def test_saras_keyword_search_parses(collector: SarasCollector) -> None:
    fetch = collector.fetch_keyword_directory("DELHI PUBLIC SCHOOL")
    assert fetch.http_status == 200
    parser = SarasParser()
    rows, errors = parser.parse_directory_html(fetch.html)
    assert len(rows) > 0
    assert rows[0].affiliation_number
    assert len(errors) == 0


@pytest.mark.live
def test_saras_himalyan_not_in_directory(collector: SarasCollector) -> None:
    fetch = collector.fetch_keyword_directory("HIMALYAN PUBLIC SCHOOL ROHTAK")
    assert fetch.http_status == 200
    parser = SarasParser()
    rows, _ = parser.parse_directory_html(fetch.html)
    names = [r.school_name.upper() for r in rows]
    assert not any("HIMALYAN" in n and "ROHTAK" in n for n in names)


@pytest.mark.live
def test_saras_detail_page(collector: SarasCollector) -> None:
    detail = collector.fetch_detail_page("1030029")
    assert detail.http_status == 200
    fields = SarasParser().parse_detail_html(detail.html)
    assert fields.get("Affiliation Number") == "1030029"
