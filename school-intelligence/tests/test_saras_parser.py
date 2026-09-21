from pathlib import Path

import pytest

from school_intel.parsers.saras_parser import SarasParser
from school_intel.utils.text import normalize_school_name

FIXTURES = Path(__file__).parent / "fixtures" / "saras"


@pytest.fixture
def parser() -> SarasParser:
    return SarasParser()


def test_parse_directory_row(parser: SarasParser) -> None:
    html = (FIXTURES / "directory_row.html").read_text(encoding="utf-8")
    rows, errors = parser.parse_directory_html(html)
    assert not errors
    assert len(rows) == 1
    row = rows[0]
    assert row.affiliation_number == "1030029"
    assert row.school_code == "50030"
    assert row.school_name == "DELHI PUBLIC SCHOOL"
    assert row.state == "MADHYA PRADESH"
    assert row.district == "GUNA"
    assert row.detail_url == "/saras/AffiliatedList/AfflicationDetails/1030029"


def test_parse_detail_page(parser: SarasParser) -> None:
    html = (FIXTURES / "detail_page.html").read_text(encoding="utf-8")
    fields = parser.parse_detail_html(html)
    assert fields["Affiliation Number"] == "1030029"
    assert fields["Pin Code"] == "473111"


def test_himalyan_empty_saras_search(parser: SarasParser) -> None:
    html = (FIXTURES / "himalyan_search_empty.html").read_text(encoding="utf-8")
    rows, errors = parser.parse_directory_html(html)
    assert rows == []
    assert not errors


def test_name_normalization_variants() -> None:
    a = normalize_school_name("HIMALYAN PUBLIC SCHOOL, ROHTAK")
    b = normalize_school_name("HIMALYAN PUBLIC SCHOOL ROHTAK")
    assert a == b


def test_different_locations_do_not_normalize_same() -> None:
    rohtak = normalize_school_name("ABC PUBLIC SCHOOL ROHTAK")
    samla = normalize_school_name("ABC PUBLIC SCHOOL SAMPLA")
    assert rohtak != samla
