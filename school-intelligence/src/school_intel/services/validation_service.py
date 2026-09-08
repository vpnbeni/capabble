from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from school_intel.db.models import SchoolEnrollment, SchoolStudentDistribution
from school_intel.domain.enums import (
    CollectionOutcomeStatus,
    DataQualityStatus,
    IdentityStatus,
    IdentifierType,
    ValidationStatus,
)
from school_intel.domain.schemas import SchoolValidationReport, ValidationIssue
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.school_identity_service import SchoolIdentityService


class ValidationService:
    def validate_school(
        self,
        session: Session,
        school_id: UUID,
        collection_status: str | None = None,
    ) -> SchoolValidationReport:
        repo = SchoolRepository(session)
        school = repo.get_by_id(school_id)
        if not school:
            raise ValueError(f"School not found: {school_id}")

        issues: list[ValidationIssue] = []

        enrollments = list(
            session.scalars(select(SchoolEnrollment).where(SchoolEnrollment.school_id == school_id)).all()
        )
        enroll_map = {row.academic_year: row.total_enrollment for row in enrollments}
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

        for dist in distributions:
            if dist.validation_status != ValidationStatus.NON_RECONCILING.value:
                continue
            enrollment_total = enroll_map.get(dist.academic_year)
            enrollment_label = enrollment_total if enrollment_total is not None else "?"
            issues.append(
                ValidationIssue(
                    code="non_reconciling_distribution",
                    message=(
                        f"{dist.academic_year} {dist.distribution_type} non_reconciling "
                        f"({dist.reported_total} vs {enrollment_label})"
                    ),
                    severity="warning",
                    details={
                        **(dist.data_quality or {}),
                        "academic_year": dist.academic_year,
                        "distribution_type": dist.distribution_type,
                        "reported_total": dist.reported_total,
                        "enrollment_total": enrollment_total,
                    },
                )
            )

        collection = self._resolve_collection_status(collection_status, school.data_quality, enrollments)
        identity = self._evaluate_identity(school)
        data_quality = self._evaluate_data_quality(issues)
        legacy_status = self._derive_legacy_validation_status(collection, identity, data_quality, issues)

        school.validation_status = legacy_status.value
        school.data_quality = {
            "collection_status": collection.value,
            "identity_status": identity.value,
            "data_quality_status": data_quality.value,
            "issue_count": len(issues),
            "issues": [issue.model_dump() for issue in issues],
        }
        session.flush()

        return SchoolValidationReport(
            school_id=school_id,
            validation_status=legacy_status,
            collection_status=collection,
            identity_status=identity,
            data_quality_status=data_quality,
            issues=issues,
        )

    def _resolve_collection_status(
        self,
        collection_status: str | None,
        existing_data_quality: dict | None,
        enrollments: list[SchoolEnrollment],
    ) -> CollectionOutcomeStatus:
        if collection_status:
            return CollectionOutcomeStatus(collection_status)
        if existing_data_quality and existing_data_quality.get("collection_status"):
            return CollectionOutcomeStatus(existing_data_quality["collection_status"])
        if enrollments:
            return CollectionOutcomeStatus.COMPLETE
        return CollectionOutcomeStatus.FAILED

    def _evaluate_identity(self, school) -> IdentityStatus:
        ident_types = {ident.identifier_type for ident in school.identifiers}
        required = {IdentifierType.UDISE.value, IdentifierType.KYS_SCHOOL_ID.value}
        if not required.issubset(ident_types):
            return IdentityStatus.UNVERIFIED
        if SchoolIdentityService.is_placeholder_canonical_name(school.canonical_name):
            return IdentityStatus.UNVERIFIED
        return IdentityStatus.VERIFIED

    def _evaluate_data_quality(self, issues: list[ValidationIssue]) -> DataQualityStatus:
        if not issues:
            return DataQualityStatus.CLEAN
        if any(issue.severity == "error" for issue in issues):
            return DataQualityStatus.ERROR
        return DataQualityStatus.WARNING

    def _derive_legacy_validation_status(
        self,
        collection: CollectionOutcomeStatus,
        identity: IdentityStatus,
        data_quality: DataQualityStatus,
        issues: list[ValidationIssue],
    ) -> ValidationStatus:
        if collection == CollectionOutcomeStatus.FAILED:
            return ValidationStatus.FAILED
        if identity == IdentityStatus.CONFLICT:
            return ValidationStatus.PARTIAL
        if identity == IdentityStatus.UNVERIFIED:
            return ValidationStatus.PARTIAL
        if collection == CollectionOutcomeStatus.PARTIAL:
            return ValidationStatus.PARTIAL
        if data_quality == DataQualityStatus.ERROR:
            return ValidationStatus.PARTIAL
        if any(issue.code == "missing_enrollment" for issue in issues):
            return ValidationStatus.PARTIAL
        return ValidationStatus.VALID
