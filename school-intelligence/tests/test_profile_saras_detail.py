"""Profile API exposes stored SARAS detail fields for the School Profile UI."""

from uuid import uuid4

from school_intel.db.models import SarasSchoolRecord, SchoolIdentifier
from school_intel.domain.enums import DataSource, IdentifierType
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.profile_service import ProfileService


def test_profile_includes_saras_detail_and_established(pg_session) -> None:
    repo = SchoolRepository(pg_session)
    school = repo.create_school(
        canonical_name="A.V.N. GLOBAL SCHOOL",
        district="ROHTAK",
        state="HARYANA",
    )
    pg_session.add(
        SchoolIdentifier(
            school_id=school.id,
            identifier_type=IdentifierType.CBSE_AFFILIATION.value,
            identifier_value="531868",
            source=DataSource.SARAS.value,
            is_verified=True,
        )
    )
    pg_session.add(
        SarasSchoolRecord(
            id=uuid4(),
            affiliation_number="531868",
            school_name="A.V.N. GLOBAL SCHOOL",
            normalized_name="A V N GLOBAL SCHOOL",
            school_id=school.id,
            website="www.avnglobalschool.in",
            pin_code="124001",
            status="Secondary Level",
            parser_version="1.0.0",
            detail_fields={
                "Postal Address": "VILLAGE DOBH, ROHTAK, HARYANA-124001",
                "Name of Principal/ Head of Institution": "MONIKA KHANNA",
                "Website": "www.avnglobalschool.in",
                "Year of Foundation": "2016",
                "Date of First Opening of School": "01 Jul 2016",
                "Gender": "Female",
                "Principal's Educational/Professional Qualifications:": "M.Sc Biochemistry, B.Ed.",
                "Administrative:": "6",
                "Teaching:": "6",
                "Status of The School": "Secondary Level",
                "School Type": "INDEPENDENT",
                "Affiliation Period": "From : 01/04/2022 To : 31/03/2027",
                "Name of Trust/ Society/ Managing Committee": "ALPS EDUCATION SOCIETY",
                "Remarks, if any": "",
                "Pin Code": "124001",
            },
        )
    )
    pg_session.flush()

    profile = ProfileService(pg_session).build_profile(school.id)
    saras = profile["saras_detail"]

    assert saras is not None
    assert saras["head_name"] == "MONIKA KHANNA"
    assert saras["address_line"] == "VILLAGE DOBH, ROHTAK, HARYANA-124001"
    assert saras["website"] == "www.avnglobalschool.in"
    assert saras["year_of_foundation"] == "2016"
    assert saras["first_opening_date"] == "01 Jul 2016"
    assert saras["principal_gender"] == "Female"
    assert saras["pin_code"] == "124001"
    assert profile["header"]["established"] == "2016"
    assert profile["header"]["location"] == "VILLAGE DOBH, ROHTAK, HARYANA-124001"
