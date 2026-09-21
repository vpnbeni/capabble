from __future__ import annotations

from uuid import UUID

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.sql import Select

from school_intel.db.models import School, SchoolEnrollment, SchoolIdentifier, SchoolTeacherYear
from school_intel.domain.enums import DataSource, IdentifierType
from school_intel.services.kys_mapping_resolver import build_kys_mapping_summary
from school_intel.services.profile_metrics import compute_enrollment_trends, students_per_teacher

ACADEMIC_YEAR_ORDER = [
    "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26",
]
LATEST_YEAR = ACADEMIC_YEAR_ORDER[-1]

VALID_SORT_FIELDS = {"name", "district", "state", "validation_status", "students", "teachers"}
VALID_KYS_STATUS = {"connected", "pending"}
VALID_VALIDATION_STATUS = {"pending", "valid", "partial", "non_reconciling", "failed"}


class DirectoryService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_schools(
        self,
        q: str | None = None,
        state: str | None = None,
        district: str | None = None,
        kys_status: str | None = None,
        validation_status: str | None = None,
        sort: str = "name",
        order: str = "asc",
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        kys_verified_exists = exists().where(
            SchoolIdentifier.school_id == School.id,
            SchoolIdentifier.identifier_type == IdentifierType.KYS_SCHOOL_ID.value,
            SchoolIdentifier.is_verified.is_(True),
        )

        def apply_filters(base_stmt: Select) -> Select:
            if q:
                pattern = f"%{q.strip()}%"
                base_stmt = base_stmt.where(
                    or_(
                        School.canonical_name.ilike(pattern),
                        School.normalized_name.ilike(pattern),
                    )
                )
            if state:
                base_stmt = base_stmt.where(School.state.ilike(state.strip()))
            if district:
                base_stmt = base_stmt.where(School.district.ilike(district.strip()))
            if validation_status and validation_status.strip() in VALID_VALIDATION_STATUS:
                base_stmt = base_stmt.where(School.validation_status == validation_status.strip())
            if kys_status == "connected":
                base_stmt = base_stmt.where(kys_verified_exists)
            elif kys_status == "pending":
                base_stmt = base_stmt.where(~kys_verified_exists)
            return base_stmt

        stmt = apply_filters(select(School).where(School.is_active.is_(True)))
        count_stmt = apply_filters(select(func.count(School.id)).where(School.is_active.is_(True)))
        total = self.session.scalar(count_stmt) or 0

        sort_field = sort if sort in VALID_SORT_FIELDS else "name"
        latest_enrollment = (
            select(SchoolEnrollment.total_enrollment)
            .where(
                SchoolEnrollment.school_id == School.id,
                SchoolEnrollment.academic_year == LATEST_YEAR,
                SchoolEnrollment.source == DataSource.KYS.value,
            )
            .correlate(School)
            .scalar_subquery()
        )
        latest_teachers = (
            select(SchoolTeacherYear.teacher_count)
            .where(
                SchoolTeacherYear.school_id == School.id,
                SchoolTeacherYear.academic_year == LATEST_YEAR,
                SchoolTeacherYear.source == DataSource.KYS.value,
            )
            .correlate(School)
            .scalar_subquery()
        )
        sort_columns = {
            "name": School.canonical_name,
            "district": School.district,
            "state": School.state,
            "validation_status": School.validation_status,
            "students": latest_enrollment,
            "teachers": latest_teachers,
        }
        sort_column = sort_columns[sort_field]
        order_expr = sort_column.desc() if order == "desc" else sort_column.asc()
        if sort_field in {"students", "teachers"}:
            # Schools with no collected data yet should sort to the bottom
            # regardless of direction, not jump to the top on nulls-first
            # (Postgres's DESC default) — otherwise "sort by students desc"
            # surfaces uncollected schools before ones with real numbers.
            order_expr = order_expr.nulls_last()

        offset = max(page - 1, 0) * limit
        schools = list(
            self.session.scalars(
                stmt.options(selectinload(School.identifiers))
                .order_by(order_expr, School.canonical_name)
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

    def list_filter_options(self) -> dict:
        # Source data mixes casing (e.g. "HARYANA" vs "Haryana") across
        # ingestion pipelines; dedupe case-insensitively for the dropdown —
        # the actual filter still matches via .ilike() regardless of casing.
        states = [
            row[0]
            for row in self.session.execute(
                select(func.upper(School.state))
                .where(School.is_active.is_(True), School.state.is_not(None))
                .distinct()
                .order_by(func.upper(School.state))
            ).all()
        ]
        districts = [
            row[0]
            for row in self.session.execute(
                select(func.upper(School.district))
                .where(School.is_active.is_(True), School.district.is_not(None))
                .distinct()
                .order_by(func.upper(School.district))
            ).all()
        ]
        return {
            "states": states,
            "districts": districts,
            "kys_status": sorted(VALID_KYS_STATUS),
            "validation_status": sorted(VALID_VALIDATION_STATUS),
        }

    def _directory_item(self, school: School) -> dict:
        identifiers = {i.identifier_type: i.identifier_value for i in school.identifiers}
        kys_summary = build_kys_mapping_summary(school, identifiers)
        has_kys = kys_summary["status"] == "connected"
        dq = school.data_quality or {}
        collection_state = dq.get("collection_status")
        if not has_kys:
            collection_state = "kys_pending"
        latest_year = "2025-26"
        enrollment = None
        teachers = None
        if has_kys:
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
        enrollments = []
        trend = None
        if has_kys:
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
            "saras_school_code": identifiers.get(IdentifierType.SARAS_SCHOOL_CODE.value),
            "students": enrollment.total_enrollment if enrollment else None,
            "teachers": teachers.teacher_count if teachers else None,
            "enrollment_change_pct": trend.percentage_change if trend else None,
            "consecutive_declines": trend.consecutive_declines if trend else None,
            "collection_state": collection_state,
            "kys_enriched": has_kys,
            "kys_mapping_status": kys_summary["status"],
            "kys_mapping_label": kys_summary["label"],
        }
