from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from school_intel.db.models import (
    CollectionRun,
    School,
    SchoolContact,
    SchoolEnrollment,
    SchoolFacility,
    SchoolIdentifier,
    SchoolStudentDistribution,
    SchoolStudentIndicators,
    SchoolTeacherYear,
    SchoolYearSnapshot,
    SourceRecord,
)
from school_intel.domain.enums import CollectionRunStatus
from school_intel.utils.text import normalize_identifier, normalize_school_name


class SchoolRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, school_id: UUID) -> School | None:
        stmt = (
            select(School)
            .where(School.id == school_id)
            .options(selectinload(School.identifiers))
        )
        return self.session.scalar(stmt)

    def find_identifier(self, identifier_type: str, identifier_value: str) -> SchoolIdentifier | None:
        value = normalize_identifier(identifier_value)
        stmt = select(SchoolIdentifier).where(
            SchoolIdentifier.identifier_type == identifier_type,
            SchoolIdentifier.identifier_value == value,
        )
        return self.session.scalar(stmt)

    def find_by_normalized_name_district_pin(
        self, canonical_name: str, district: str | None, pin_code: str | None
    ) -> list[School]:
        stmt = select(School).where(School.normalized_name == normalize_school_name(canonical_name))
        if district:
            stmt = stmt.where(School.district == district.strip())
        if pin_code:
            stmt = stmt.where(School.pin_code == normalize_identifier(pin_code))
        return list(self.session.scalars(stmt).all())

    def create_school(
        self,
        canonical_name: str,
        district: str | None = None,
        state: str | None = None,
        pin_code: str | None = None,
        address_line: str | None = None,
    ) -> School:
        school = School(
            canonical_name=canonical_name.strip(),
            normalized_name=normalize_school_name(canonical_name),
            district=district,
            state=state,
            pin_code=normalize_identifier(pin_code) if pin_code else None,
            address_line=address_line,
        )
        self.session.add(school)
        self.session.flush()
        return school

    def upsert_identifier(
        self,
        school_id: UUID,
        identifier_type: str,
        identifier_value: str,
        source: str,
        source_record_id: UUID | None = None,
        is_verified: bool = False,
    ) -> SchoolIdentifier:
        value = normalize_identifier(identifier_value)
        existing = self.find_identifier(identifier_type, value)
        if existing:
            return existing

        identifier = SchoolIdentifier(
            school_id=school_id,
            identifier_type=identifier_type,
            identifier_value=value,
            source=source,
            source_record_id=source_record_id,
            is_verified=is_verified,
            verified_at=datetime.now(timezone.utc) if is_verified else None,
        )
        self.session.add(identifier)
        self.session.flush()
        return identifier

    def upsert_enrollment(
        self,
        school_id: UUID,
        academic_year: str,
        source: str,
        total_enrollment: int | None,
        rte_count: int | None,
        source_record_id: UUID | None,
        provenance: dict | None,
        snapshot_id: UUID | None = None,
    ) -> SchoolEnrollment:
        stmt = select(SchoolEnrollment).where(
            SchoolEnrollment.school_id == school_id,
            SchoolEnrollment.academic_year == academic_year,
            SchoolEnrollment.source == source,
        )
        row = self.session.scalar(stmt)
        if row is None:
            row = SchoolEnrollment(
                school_id=school_id,
                academic_year=academic_year,
                source=source,
            )
            self.session.add(row)
        if snapshot_id is not None:
            row.snapshot_id = snapshot_id
        if total_enrollment is not None:
            row.total_enrollment = total_enrollment
        if rte_count is not None:
            row.rte_count = rte_count
        row.source_record_id = source_record_id
        row.provenance = provenance
        self.session.flush()
        return row

    def upsert_student_distribution(
        self,
        school_id: UUID,
        academic_year: str,
        source: str,
        distribution_type: str,
        reported_total: int | None,
        buckets: dict | None,
        validation_status: str,
        data_quality: dict | None,
        source_record_id: UUID | None,
        provenance: dict | None,
    ) -> SchoolStudentDistribution:
        stmt = select(SchoolStudentDistribution).where(
            SchoolStudentDistribution.school_id == school_id,
            SchoolStudentDistribution.academic_year == academic_year,
            SchoolStudentDistribution.source == source,
            SchoolStudentDistribution.distribution_type == distribution_type,
        )
        row = self.session.scalar(stmt)
        if row is None:
            row = SchoolStudentDistribution(
                school_id=school_id,
                academic_year=academic_year,
                source=source,
                distribution_type=distribution_type,
            )
            self.session.add(row)
        row.reported_total = reported_total
        row.buckets = buckets
        row.validation_status = validation_status
        row.data_quality = data_quality
        row.source_record_id = source_record_id
        row.provenance = provenance
        self.session.flush()
        return row

    def create_snapshot(
        self,
        school_id: UUID,
        academic_year: str,
        source: str,
        source_record_id: UUID | None,
        validation_status: str,
        data_quality: dict | None,
    ) -> SchoolYearSnapshot:
        stmt = select(SchoolYearSnapshot).where(
            SchoolYearSnapshot.school_id == school_id,
            SchoolYearSnapshot.academic_year == academic_year,
            SchoolYearSnapshot.source == source,
        )
        snapshot = self.session.scalar(stmt)
        if snapshot is None:
            snapshot = SchoolYearSnapshot(
                school_id=school_id,
                academic_year=academic_year,
                source=source,
            )
            self.session.add(snapshot)
        snapshot.source_record_id = source_record_id
        snapshot.validation_status = validation_status
        snapshot.data_quality = data_quality
        self.session.flush()
        return snapshot

    def upsert_teacher_year(
        self,
        school_id: UUID,
        academic_year: str,
        source: str,
        teacher_count: int | None,
        details: dict | None,
        source_record_id: UUID | None,
        provenance: dict | None,
    ) -> SchoolTeacherYear:
        stmt = select(SchoolTeacherYear).where(
            SchoolTeacherYear.school_id == school_id,
            SchoolTeacherYear.academic_year == academic_year,
            SchoolTeacherYear.source == source,
        )
        row = self.session.scalar(stmt)
        if row is None:
            row = SchoolTeacherYear(
                school_id=school_id,
                academic_year=academic_year,
                source=source,
            )
            self.session.add(row)
        row.teacher_count = teacher_count
        row.details = details
        row.source_record_id = source_record_id
        row.provenance = provenance
        self.session.flush()
        return row

    def upsert_contact(
        self,
        school_id: UUID,
        contact_type: str,
        contact_value: str,
        label: str | None,
        source: str,
        source_record_id: UUID | None,
        provenance: dict | None,
    ) -> SchoolContact:
        stmt = select(SchoolContact).where(
            SchoolContact.school_id == school_id,
            SchoolContact.contact_type == contact_type,
            SchoolContact.contact_value == contact_value,
        )
        row = self.session.scalar(stmt)
        if row is None:
            row = SchoolContact(
                school_id=school_id,
                contact_type=contact_type,
                contact_value=contact_value,
                source=source,
            )
            self.session.add(row)
        row.label = label
        row.source_record_id = source_record_id
        row.provenance = provenance
        self.session.flush()
        return row

    def upsert_facility(
        self,
        school_id: UUID,
        academic_year: str | None,
        facility_key: str,
        facility_value: dict | None,
        source: str,
        source_record_id: UUID | None,
        provenance: dict | None,
    ) -> SchoolFacility:
        stmt = select(SchoolFacility).where(
            SchoolFacility.school_id == school_id,
            SchoolFacility.academic_year == academic_year,
            SchoolFacility.facility_key == facility_key,
            SchoolFacility.source == source,
        )
        row = self.session.scalar(stmt)
        if row is None:
            row = SchoolFacility(
                school_id=school_id,
                academic_year=academic_year,
                facility_key=facility_key,
                source=source,
            )
            self.session.add(row)
        row.facility_value = facility_value
        row.source_record_id = source_record_id
        row.provenance = provenance
        self.session.flush()
        return row

    def upsert_student_indicator(
        self,
        school_id: UUID,
        academic_year: str,
        indicator_key: str,
        indicator_value: dict | None,
        source: str,
        source_record_id: UUID | None,
        provenance: dict | None,
    ) -> SchoolStudentIndicators:
        stmt = select(SchoolStudentIndicators).where(
            SchoolStudentIndicators.school_id == school_id,
            SchoolStudentIndicators.academic_year == academic_year,
            SchoolStudentIndicators.indicator_key == indicator_key,
            SchoolStudentIndicators.source == source,
        )
        row = self.session.scalar(stmt)
        if row is None:
            row = SchoolStudentIndicators(
                school_id=school_id,
                academic_year=academic_year,
                indicator_key=indicator_key,
                source=source,
            )
            self.session.add(row)
        row.indicator_value = indicator_value
        row.source_record_id = source_record_id
        row.provenance = provenance
        self.session.flush()
        return row


class CollectionRunRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, run_type: str, source: str, parameters: dict | None = None) -> CollectionRun:
        run = CollectionRun(
            run_type=run_type,
            source=source,
            status=CollectionRunStatus.PENDING.value,
            parameters=parameters or {},
        )
        self.session.add(run)
        self.session.flush()
        return run

    def mark_running(self, run_id: UUID) -> CollectionRun:
        run = self.session.get(CollectionRun, run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")
        run.status = CollectionRunStatus.RUNNING.value
        run.started_at = datetime.now(timezone.utc)
        self.session.flush()
        return run

    def update_progress(
        self,
        run_id: UUID,
        processed_count: int,
        failed_count: int,
        cursor_value: str | None = None,
        status: str | None = None,
        error_summary: str | None = None,
    ) -> CollectionRun:
        run = self.session.get(CollectionRun, run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")
        run.processed_count = processed_count
        run.failed_count = failed_count
        if cursor_value is not None:
            run.cursor_value = cursor_value
        if status is not None:
            run.status = status
            if status in {CollectionRunStatus.COMPLETED.value, CollectionRunStatus.FAILED.value}:
                run.completed_at = datetime.now(timezone.utc)
        if error_summary is not None:
            run.error_summary = error_summary
        self.session.flush()
        return run

    def get(self, run_id: UUID) -> CollectionRun | None:
        return self.session.get(CollectionRun, run_id)


class SourceRecordRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_idempotency_key(self, idempotency_key: str) -> SourceRecord | None:
        stmt = select(SourceRecord).where(SourceRecord.idempotency_key == idempotency_key)
        return self.session.scalar(stmt)

    def create_if_absent(
        self,
        *,
        school_id: UUID | None,
        collection_run_id: UUID | None,
        source: str,
        endpoint: str,
        academic_year: str | None,
        request_params: dict | None,
        raw_payload: dict,
        payload_checksum: str,
        http_status: int | None,
        idempotency_key: str,
    ) -> tuple[SourceRecord, bool]:
        existing = self.get_by_idempotency_key(idempotency_key)
        if existing:
            return existing, False

        record = SourceRecord(
            school_id=school_id,
            collection_run_id=collection_run_id,
            source=source,
            endpoint=endpoint,
            academic_year=academic_year,
            request_params=request_params,
            raw_payload=raw_payload,
            payload_checksum=payload_checksum,
            http_status=http_status,
            idempotency_key=idempotency_key,
        )
        self.session.add(record)
        self.session.flush()
        return record, True
