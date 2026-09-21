import json
from pathlib import Path

import pytest

from school_intel.domain.enums import ValidationStatus
from school_intel.domain.schemas import EnrollmentNormalized
from school_intel.parsers.kys_parser import KysParser

FIXTURES = Path(__file__).parent / "fixtures" / "himalyan"


@pytest.fixture
def expected() -> dict:
    return json.loads((FIXTURES / "expected.json").read_text(encoding="utf-8"))


@pytest.fixture
def parser() -> KysParser:
    return KysParser()


def test_himalyan_flag1_2020_21(parser: KysParser, expected: dict) -> None:
    payload = json.loads((FIXTURES / "social_data_flag1_2020_21.json").read_text(encoding="utf-8"))
    enrollment = parser.parse_enrollment_from_social_flag1(payload, "2020-21")
    gender = parser.parse_gender_totals_from_social_flag1(payload)
    year_expected = expected["expected_enrollment_by_year"]["2020-21"]
    assert enrollment.total_enrollment == year_expected["total"]
    assert gender["boys"] == year_expected["boys"]
    assert gender["girls"] == year_expected["girls"]


def test_himalyan_report_card_fixture_compat(parser: KysParser, expected: dict) -> None:
    payload = json.loads((FIXTURES / "report_card_2020_21.json").read_text(encoding="utf-8"))
    enrollment = parser.parse_report_card(payload, "2020-21")
    year_expected = expected["expected_enrollment_by_year"]["2020-21"]
    assert enrollment.total_enrollment == year_expected["total"]
    assert enrollment.rte_count == year_expected["rte"]


def test_himalyan_enrollment_series_flag1(parser: KysParser, expected: dict) -> None:
    """Golden values live only in fixtures — production code must not embed them."""
    for year, values in expected["expected_enrollment_by_year"].items():
        if year == "2020-21":
            payload = json.loads((FIXTURES / "social_data_flag1_2020_21.json").read_text(encoding="utf-8"))
        else:
            payload = {
                "data": {
                    "schEnrollmentYearDataTotal": {
                        "finalTotal": values["total"],
                        "rowBoyTotal": values["boys"],
                        "rowGirlTotal": values["girls"],
                    }
                }
            }
        enrollment = parser.parse_enrollment_from_social_flag1(payload, year)
        assert enrollment.total_enrollment == values["total"]


def test_himalyan_flag3_non_reconciling(parser: KysParser, expected: dict) -> None:
    payload = json.loads((FIXTURES / "social_data_flag3_2020_21.json").read_text(encoding="utf-8"))
    distribution = parser.parse_social_data_flag3(payload, "2020-21")
    enrollment = EnrollmentNormalized(
        academic_year="2020-21",
        total_enrollment=expected["expected_enrollment_by_year"]["2020-21"]["total"],
        rte_count=expected["expected_enrollment_by_year"]["2020-21"]["rte"],
        provenance={},
    )
    reconciled = parser.reconcile_flag3_with_enrollment(distribution, enrollment)

    flag_expected = expected["expected_2020_21_flag_3"]
    assert reconciled.reported_total == flag_expected["reported_total"]
    assert reconciled.validation_status == ValidationStatus.NON_RECONCILING
    assert reconciled.data_quality["annual_enrollment_total"] == flag_expected["annual_enrollment_total"]


def test_null_enrollment_is_preserved(parser: KysParser) -> None:
    payload = {"data": {"schEnrollmentYearDataTotal": {"finalTotal": None, "rowTotal": None}}}
    enrollment = parser.parse_enrollment_from_social_flag1(payload, "2020-21")
    assert enrollment.total_enrollment is None
