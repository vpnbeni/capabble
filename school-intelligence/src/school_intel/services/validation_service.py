from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from school_intel.db.models import SchoolEnrollment, SchoolStudentDistribution
from school_intel.domain.enums import ValidationStatus
from school_intel.domain.schemas import SchoolValidationReport, ValidationIssue
from school_intel.repositories.school_repository import SchoolRepository


class ValidationService:
    def validate_school(self, session: Session, school_id: UUID) -> SchoolValidationReport:
        repo = SchoolRepository(session)
        school = repo.get_by_id(school_id)
        if not school:
            raise ValueError(f"School not found: {school_id}")

        issues: list[ValidationIssue] = []
        overall = ValidationStatus.VALID

        enrollments = list(
            session.scalars(select(SchoolEnrollment).where(SchoolEnrollment.school_id == school_id)).all()
        )
        distributions = list(
            session.scalars(
                select(SchoolStudentDistribution).where(SchoolStudentDistribution.school_id == school_id)
            ).all()
        )

        if not enrollments:
            issues.append(
                ValidationIssue(
                    code="missing_enrollment",
                    message="No enrollment records found for this school.",
                    severity="warning",
                )
            )
            overall = ValidationStatus.PARTIAL

        for dist in distributions:
            if dist.validation_status == ValidationStatus.NON_RECONCILING.value:
                issues.append(
                    ValidationIssue(
                        code="non_reconciling_distribution",
                        message=(
                            f"{dist.distribution_type} for {dist.academic_year} does not reconcile with enrollment."
                        ),
                        severity="error",
                        details=dist.data_quality or {},
                    )
                )
                overall = ValidationStatus.NON_RECONCILING

        school.validation_status = overall.value
        school.data_quality = {"issue_count": len(issues)}
        session.flush()

        return SchoolValidationReport(school_id=school_id, validation_status=overall, issues=issues)
