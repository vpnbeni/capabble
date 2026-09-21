import json
from pathlib import Path

import pytest

from school_intel.domain.enums import DataSource, IdentifierType
from school_intel.domain.schemas import SchoolIdentifierInput
from school_intel.services.school_identity_service import IdentityLookupInput, SchoolIdentityService

FIXTURES = Path(__file__).parent / "fixtures" / "himalyan"


@pytest.fixture
def expected() -> dict:
    return json.loads((FIXTURES / "identity_expected.json").read_text(encoding="utf-8"))


def test_himalyan_saras_not_present_fixture(expected: dict) -> None:
    assert expected["saras"]["present_in_directory"] is False


def test_himalyan_multi_identifier_single_school(pg_session, expected: dict) -> None:
    service = SchoolIdentityService(pg_session)
    ids = expected["identifiers"]

    first = service.resolve(
        IdentityLookupInput(
            canonical_name=expected["school_name"],
            district="Rohtak",
            state="Haryana",
            identifiers=[
                SchoolIdentifierInput(
                    identifier_type=IdentifierType.UDISE,
                    identifier_value=ids["udise"],
                    source=DataSource.KYS,
                    is_verified=True,
                )
            ],
        )
    )
    assert first.school_id is not None

    for id_type, key in [
        (IdentifierType.STATE_SCHOOL_CODE, "state_school_code"),
        (IdentifierType.KYS_SCHOOL_ID, "kys_school_id"),
    ]:
        result = service.resolve(
            IdentityLookupInput(
                identifiers=[
                    SchoolIdentifierInput(
                        identifier_type=id_type,
                        identifier_value=ids[key],
                        source=DataSource.KYS,
                        is_verified=True,
                    )
                ]
            ),
            create_if_missing=False,
        )
        assert result.school_id == first.school_id
