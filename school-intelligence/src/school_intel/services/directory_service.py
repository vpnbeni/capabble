from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from school_intel.db.models import School, SchoolEnrollment, SchoolIdentifier, SchoolTeacherYear
from school_intel.domain.enums import DataSource, IdentifierType
from school_intel.services.profile_metrics import compute_enrollment_trends, students_per_teacher

ACADEMIC_YEAR_ORDER = [
    "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26",
]


class DirectoryService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_schools(
        self,
        q: str | None = None,
        state: str | None = None,
        district: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        stmt = select(School).where(School.is_active.is_(True))
        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    School.canonical_name.ilike(pattern),
                    School.normalized_name.ilike(pattern),
                )
            )
        if state:
            stmt = stmt.where(School.state.ilike(state.strip()))
        if district:
            stmt = stmt.where(School.district.ilike(district.strip()))

        count_stmt = select(func.count(School.id)).where(School.is_active.is_(True))
        if q:
            pattern = f"%{q.strip()}%"
            count_stmt = count_stmt.where(
                or_(
                    School.canonical_name.ilike(pattern),
                    School.normalized_name.ilike(pattern),
                )
            )
        if state:
            count_stmt = count_stmt.where(School.state.ilike(state.strip()))
        if district:
            count_stmt = count_stmt.where(School.district.ilike(district.strip()))
        total = self.session.scalar(count_stmt) or 0
        offset = max(page - 1, 0) * limit
        schools = list(
            self.session.scalars(
                stmt.options(selectinload(School.identifiers))
                .order_by(School.canonical_name)
                .offset(offset)
                .limit(limit)
            ).all()
        )

        items = [self._directory_item(school) for school in schools]
        return {
            "items": items,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit if limit else 0,
            },
        }

    def _directory_item(self, school: School) -> dict:
        identifiers = {i.identifier_type: i.identifier_value for i in school.identifiers}
        latest_year = "2025-26"
        enrollment = self.session.scalar(
            select(SchoolEnrollment).where(
                SchoolEnrollment.school_id == school.id,
                SchoolEnrollment.academic_year == latest_year,
                SchoolEnrollment.source == DataSource.KYS.value,
            )
        )
        teachers = self.session.scalar(
            select(SchoolTeacherYear).where(
                SchoolTeacherYear.school_id == school.id,
                SchoolTeacherYear.academic_year == latest_year,
                SchoolTeacherYear.source == DataSource.KYS.value,
            )
        )
        enrollments = list(
            self.session.scalars(
                select(SchoolEnrollment).where(
                    SchoolEnrollment.school_id == school.id,
                    SchoolEnrollment.source == DataSource.KYS.value,
                )
            ).all()
        )
        series = [(y, next((e.total_enrollment for e in enrollments if e.academic_year == y), None)) for y in ACADEMIC_YEAR_ORDER]
        trend = compute_enrollment_trends(series)

        return {
            "id": str(school.id),
            "name": school.canonical_name,
            "location": ", ".join(p for p in [school.district, school.state] if p),
            "udise": identifiers.get(IdentifierType.UDISE.value),
            "state_school_code": identifiers.get(IdentifierType.STATE_SCHOOL_CODE.value),
            "students": enrollment.total_enrollment if enrollment else None,
            "teachers": teachers.teacher_count if teachers else None,
            "enrollment_change_pct": trend.percentage_change,
            "consecutive_declines": trend.consecutive_declines,
        }
