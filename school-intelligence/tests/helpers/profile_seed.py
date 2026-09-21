from __future__ import annotations

import uuid

from school_intel.db.models import (
    School,
    SchoolEnrollment,
    SchoolIdentifier,
    SchoolStudentDistribution,
    SchoolStudentIndicators,
    SchoolTeacherYear,
    SchoolYearSnapshot,
)
from school_intel.domain.enums import DataSource, IdentifierType, ValidationStatus


def seed_himalyan_school(session) -> uuid.UUID:
    school = School(
        id=uuid.uuid4(),
        canonical_name="HIMALYAN PUBLIC SCHOOL, ROHTAK",
        normalized_name="HIMALYAN PUBLIC SCHOOL ROHTAK",
        district="Rohtak",
        state="Haryana",
        validation_status="valid",
    )
    session.add(school)
    session.flush()

    for ident_type, value in [
        (IdentifierType.UDISE.value, "06140404094"),
        (IdentifierType.STATE_SCHOOL_CODE.value, "25299"),
        (IdentifierType.KYS_SCHOOL_ID.value, "1519942"),
    ]:
        session.add(
            SchoolIdentifier(
                school_id=school.id,
                identifier_type=ident_type,
                identifier_value=value,
                source=DataSource.KYS.value,
            )
        )

    enrollment_data = {
        "2019-20": 444,
        "2020-21": 413,
        "2021-22": 395,
        "2022-23": 316,
        "2023-24": 286,
        "2024-25": 240,
        "2025-26": 222,
    }
    teacher_data = {
        "2019-20": 11,
        "2020-21": 10,
        "2021-22": 10,
        "2022-23": 10,
        "2023-24": 10,
        "2024-25": 12,
        "2025-26": 13,
    }
    gender_data = {
        "2025-26": {"boys": 121, "girls": 101},
        "2020-21": {"boys": 236, "girls": 177},
    }

    for year, total in enrollment_data.items():
        session.add(
            SchoolEnrollment(
                school_id=school.id,
                academic_year=year,
                source=DataSource.KYS.value,
                total_enrollment=total,
            )
        )
        session.add(
            SchoolYearSnapshot(
                school_id=school.id,
                academic_year=year,
                source=DataSource.KYS.value,
                validation_status=ValidationStatus.VALID.value,
            )
        )
        if year in gender_data:
            session.add(
                SchoolStudentIndicators(
                    school_id=school.id,
                    academic_year=year,
                    source=DataSource.KYS.value,
                    indicator_key="gender_totals",
                    indicator_value=gender_data[year],
                )
            )

    for year, count in teacher_data.items():
        session.add(
            SchoolTeacherYear(
                school_id=school.id,
                academic_year=year,
                source=DataSource.KYS.value,
                teacher_count=count,
            )
        )

    session.add(
        SchoolStudentDistribution(
            school_id=school.id,
            academic_year="2020-21",
            source=DataSource.KYS.value,
            distribution_type="getSocialData:3",
            reported_total=392,
            validation_status=ValidationStatus.NON_RECONCILING.value,
            data_quality={"annual_enrollment_total": 413},
        )
    )

    session.flush()
    return school.id
