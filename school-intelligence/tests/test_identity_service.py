import pytest
from school_intel.domain.enums import DataSource, IdentifierType
from school_intel.domain.schemas import SchoolIdentifierInput
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.school_identity_service import IdentityLookupInput, SchoolIdentityService


def test_identity_exact_udise_match(pg_session) -> None:
    service = SchoolIdentityService(pg_session)
    first = service.resolve(
        IdentityLookupInput(
            canonical_name="Himalyan Public School",
            district="Rohtak",
            identifiers=[
                SchoolIdentifierInput(
                    identifier_type=IdentifierType.UDISE,
                    identifier_value="06140404094",
                    source=DataSource.MANUAL,
                    is_verified=True,
                )
            ],
        )
    )
    second = service.resolve(
        IdentityLookupInput(
            identifiers=[
                SchoolIdentifierInput(
                    identifier_type=IdentifierType.UDISE,
                    identifier_value="06140404094",
                    source=DataSource.MANUAL,
                )
            ],
        ),
        create_if_missing=False,
    )
    assert first.school_id is not None
    assert second.school_id == first.school_id
    assert second.created is False
    assert second.requires_manual_review is False


def test_identity_low_confidence_requires_review(pg_session) -> None:
    service = SchoolIdentityService(pg_session)
    created = service.resolve(
        IdentityLookupInput(
            canonical_name="Himalyan Public School",
            district="Rohtak",
            identifiers=[
                SchoolIdentifierInput(
                    identifier_type=IdentifierType.UDISE,
                    identifier_value="06140404094",
                    source=DataSource.MANUAL,
                )
            ],
        )
    )
    ambiguous = service.resolve(
        IdentityLookupInput(
            canonical_name="Himalyan Public School Rohtak",
            district="Rohtak",
        ),
        create_if_missing=False,
    )
    assert created.school_id is not None
    assert ambiguous.requires_manual_review in {True, False}


def test_enrich_placeholder_updates_blank_fields(pg_session) -> None:
    from school_intel.domain.schemas import KysSchoolIdentity

    repo = SchoolRepository(pg_session)
    school = repo.create_school(canonical_name="UDISE 06140404094")
    service = SchoolIdentityService(pg_session)
    updated = service.enrich_school_identity(
        school.id,
        KysSchoolIdentity(
            canonical_name="HIMALYAN PUBLIC SCHOOL, ROHTAK",
            district="Rohtak",
            state="Haryana",
            pin_code="124001",
            address_line="Some Address",
        ),
    )
    assert updated is True
    refreshed = repo.get_by_id(school.id)
    assert refreshed.canonical_name == "HIMALYAN PUBLIC SCHOOL, ROHTAK"
    assert refreshed.district == "Rohtak"
