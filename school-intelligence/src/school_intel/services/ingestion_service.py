from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from school_intel.db.models import (
    SchoolContact,
    SchoolEnrollment,
    SchoolFacility,
    SchoolStudentDistribution,
    SchoolStudentIndicators,
    SchoolTeacherYear,
)
from school_intel.domain.enums import DataSource, KysEndpoint, ValidationStatus
from school_intel.domain.schemas import EnrollmentNormalized
from school_intel.parsers.kys_parser import KysParser
from school_intel.repositories.school_repository import SchoolRepository

logger = logging.getLogger("school_intel.ingestion")


class IngestionService:
    """Persist normalized records from raw source payloads with provenance."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = SchoolRepository(session)
        self.kys_parser = KysParser()

    def ingest_kys_payload(
        self,
        school_id: UUID,
        academic_year: str,
        year_id: int,
        endpoint: str,
        raw_payload: dict,
        source_record_id: UUID | None,
        http_status: int | None = None,
    ) -> str | None:
        """Route raw KYS payload to the appropriate normalizer. Returns validation_status if applicable."""
        if endpoint == KysEndpoint.REPORT_CARD.value:
            return self._ingest_report_card(school_id, academic_year, year_id, raw_payload, source_record_id)
        if endpoint == KysEndpoint.PROFILE.value:
            return self._ingest_profile(school_id, academic_year, raw_payload, source_record_id)
        if endpoint == KysEndpoint.FACILITY.value:
            return self._ingest_facility(school_id, academic_year, raw_payload, source_record_id)
        if endpoint == KysEndpoint.SOCIAL_DATA_1.value:
            return self._ingest_social_flag1(school_id, academic_year, year_id, raw_payload, source_record_id)
        if endpoint == KysEndpoint.SOCIAL_DATA_2.value:
            return self._ingest_social_distribution(
                school_id, academic_year, "getSocialData:2", raw_payload, source_record_id
            )
        if endpoint == KysEndpoint.SOCIAL_DATA_3.value:
            return self._ingest_social_flag3(school_id, academic_year, raw_payload, source_record_id)
        if endpoint == KysEndpoint.SOCIAL_DATA_4.value:
            return self._ingest_social_flag4(school_id, academic_year, raw_payload, source_record_id)
        if endpoint == KysEndpoint.SOCIAL_DATA_5.value:
            return self._ingest_social_flag5(school_id, academic_year, raw_payload, source_record_id)
        logger.warning("unknown_endpoint endpoint=%s", endpoint)
        return None

    def _ingest_report_card(
        self,
        school_id: UUID,
        academic_year: str,
        year_id: int,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        teachers = self.kys_parser.parse_teacher_year(raw_payload)
        snapshot = self.repo.create_snapshot(
            school_id=school_id,
            academic_year=academic_year,
            source=DataSource.KYS.value,
            source_record_id=source_record_id,
            validation_status=ValidationStatus.VALID.value,
            data_quality={"endpoint": "report-card", "yearId": year_id},
        )
        self.repo.upsert_teacher_year(
            school_id=school_id,
            academic_year=academic_year,
            source=DataSource.KYS.value,
            teacher_count=teachers["teacher_count"],
            details=teachers["details"],
            source_record_id=source_record_id,
            provenance={"endpoint": "report-card", "yearId": year_id},
        )
        return snapshot.validation_status

    def _ingest_profile(
        self,
        school_id: UUID,
        academic_year: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        contacts = self.kys_parser.parse_profile_contacts(raw_payload)
        for contact in contacts:
            self.repo.upsert_contact(
                school_id=school_id,
                contact_type=contact["contact_type"],
                contact_value=contact["contact_value"],
                label=contact.get("label"),
                source=DataSource.KYS.value,
                source_record_id=source_record_id,
                provenance={"endpoint": "profile", "academic_year": academic_year},
            )
        return ValidationStatus.VALID.value

    def _ingest_facility(
        self,
        school_id: UUID,
        academic_year: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        facilities = self.kys_parser.parse_facilities(raw_payload)
        for key, value in facilities.items():
            self.repo.upsert_facility(
                school_id=school_id,
                academic_year=academic_year,
                facility_key=key,
                facility_value={"raw": value},
                source=DataSource.KYS.value,
                source_record_id=source_record_id,
                provenance={"endpoint": "facility"},
            )
        return ValidationStatus.VALID.value

    def _ingest_social_flag1(
        self,
        school_id: UUID,
        academic_year: str,
        year_id: int,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        enrollment = self.kys_parser.parse_enrollment_from_social_flag1(raw_payload, academic_year)
        gender = self.kys_parser.parse_gender_totals_from_social_flag1(raw_payload)

        snapshot = self.repo.create_snapshot(
            school_id=school_id,
            academic_year=academic_year,
            source=DataSource.KYS.value,
            source_record_id=source_record_id,
            validation_status=ValidationStatus.VALID.value,
            data_quality={
                "endpoint": "getSocialData:1",
                "yearId": year_id,
                "boys": gender["boys"],
                "girls": gender["girls"],
            },
        )
        self.repo.upsert_enrollment(
            school_id=school_id,
            academic_year=academic_year,
            source=DataSource.KYS.value,
            total_enrollment=enrollment.total_enrollment,
            rte_count=None,
            source_record_id=source_record_id,
            provenance=enrollment.provenance,
            snapshot_id=snapshot.id,
        )
        self.repo.upsert_student_indicator(
            school_id=school_id,
            academic_year=academic_year,
            indicator_key="gender_totals",
            indicator_value=gender,
            source=DataSource.KYS.value,
            source_record_id=source_record_id,
            provenance={"endpoint": "getSocialData:1"},
        )
        return ValidationStatus.VALID.value

    def _ingest_social_flag3(
        self,
        school_id: UUID,
        academic_year: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        distribution = self.kys_parser.parse_social_data_flag3(raw_payload, academic_year)
        enrollment_row = self.session.scalar(
            select(SchoolEnrollment).where(
                SchoolEnrollment.school_id == school_id,
                SchoolEnrollment.academic_year == academic_year,
                SchoolEnrollment.source == DataSource.KYS.value,
            )
        )
        if enrollment_row and enrollment_row.total_enrollment is not None:
            enrollment = EnrollmentNormalized(
                academic_year=academic_year,
                total_enrollment=enrollment_row.total_enrollment,
                rte_count=enrollment_row.rte_count,
                provenance=enrollment_row.provenance or {},
            )
            distribution = self.kys_parser.reconcile_flag3_with_enrollment(distribution, enrollment)
        else:
            distribution.validation_status = ValidationStatus.PARTIAL
            distribution.data_quality = {
                "reason": "enrollment_missing_for_reconciliation",
                "reported_total": distribution.reported_total,
            }

        self.repo.upsert_student_distribution(
            school_id=school_id,
            academic_year=academic_year,
            source=DataSource.KYS.value,
            distribution_type=distribution.distribution_type,
            reported_total=distribution.reported_total,
            buckets=distribution.buckets,
            validation_status=distribution.validation_status.value,
            data_quality=distribution.data_quality,
            source_record_id=source_record_id,
            provenance=distribution.provenance,
        )
        return distribution.validation_status.value

    def _ingest_social_flag4(
        self,
        school_id: UUID,
        academic_year: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        ews = self.kys_parser.parse_ews_from_social_flag4(raw_payload)
        self.repo.upsert_student_indicator(
            school_id=school_id,
            academic_year=academic_year,
            indicator_key="ews_count",
            indicator_value={"ews": ews},
            source=DataSource.KYS.value,
            source_record_id=source_record_id,
            provenance={"endpoint": "getSocialData:4"},
        )
        return ValidationStatus.VALID.value

    def _ingest_social_flag5(
        self,
        school_id: UUID,
        academic_year: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        rte = self.kys_parser.parse_rte_from_social_flag5(raw_payload, academic_year)
        enrollment_row = self.session.scalar(
            select(SchoolEnrollment).where(
                SchoolEnrollment.school_id == school_id,
                SchoolEnrollment.academic_year == academic_year,
                SchoolEnrollment.source == DataSource.KYS.value,
            )
        )
        if enrollment_row:
            enrollment_row.rte_count = rte
            enrollment_row.provenance = {
                **(enrollment_row.provenance or {}),
                "rte_source": "getSocialData:5",
            }
            self.session.flush()
        self.repo.upsert_student_indicator(
            school_id=school_id,
            academic_year=academic_year,
            indicator_key="rte_count",
            indicator_value={"rte": rte},
            source=DataSource.KYS.value,
            source_record_id=source_record_id,
            provenance={"endpoint": "getSocialData:5"},
        )
        return ValidationStatus.VALID.value

    def _ingest_social_distribution(
        self,
        school_id: UUID,
        academic_year: str,
        distribution_type: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> str:
        distribution = self.kys_parser.parse_social_data_flag3(raw_payload, academic_year)
        distribution.distribution_type = distribution_type
        distribution.validation_status = ValidationStatus.VALID
        self.repo.upsert_student_distribution(
            school_id=school_id,
            academic_year=academic_year,
            source=DataSource.KYS.value,
            distribution_type=distribution_type,
            reported_total=distribution.reported_total,
            buckets=distribution.buckets,
            validation_status=distribution.validation_status.value,
            data_quality=distribution.data_quality,
            source_record_id=source_record_id,
            provenance=distribution.provenance,
        )
        return ValidationStatus.VALID.value

    # Legacy methods kept for golden tests
    def ingest_kys_report_card(
        self,
        school_id: UUID,
        academic_year: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> None:
        self._ingest_report_card(school_id, academic_year, 0, raw_payload, source_record_id)

    def ingest_kys_social_flag3(
        self,
        school_id: UUID,
        academic_year: str,
        raw_payload: dict,
        source_record_id: UUID | None,
    ) -> None:
        self._ingest_social_flag3(school_id, academic_year, raw_payload, source_record_id)
