from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from school_intel.db.base import Base


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class School(Base):
    __tablename__ = "schools"

    id: Mapped[uuid.UUID] = _uuid_pk()
    canonical_name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    address_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    district: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    state: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    pin_code: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    validation_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    data_quality: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    identifiers: Mapped[list[SchoolIdentifier]] = relationship(back_populates="school", cascade="all, delete-orphan")
    snapshots: Mapped[list[SchoolYearSnapshot]] = relationship(back_populates="school", cascade="all, delete-orphan")
    prospects: Mapped[list[SchoolProspect]] = relationship(back_populates="school", cascade="all, delete-orphan")
    capabble_tenant: Mapped[CapabbleTenant | None] = relationship(back_populates="school", uselist=False)


class SchoolIdentifier(Base):
    __tablename__ = "school_identifiers"
    __table_args__ = (
        UniqueConstraint("identifier_type", "identifier_value", name="uq_school_identifiers_type_value"),
        Index("ix_school_identifiers_school_type", "school_id", "identifier_type"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    identifier_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    identifier_value: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    school: Mapped[School] = relationship(back_populates="identifiers")


class CollectionRun(Base):
    __tablename__ = "collection_runs"
    __table_args__ = (Index("ix_collection_runs_status_source", "status", "source"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    run_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending", index=True)
    parameters: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    cursor_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    total_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    source_records: Mapped[list[SourceRecord]] = relationship(back_populates="collection_run")
    school_items: Mapped[list["CollectionRunSchool"]] = relationship(back_populates="collection_run")


class CollectionRunSchool(Base):
    __tablename__ = "collection_run_schools"
    __table_args__ = (
        Index("ix_collection_run_schools_run_status", "collection_run_id", "collection_status"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    collection_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    affiliation_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    school_name: Mapped[str] = mapped_column(String(500), nullable=False)
    school_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    district: Mapped[str | None] = mapped_column(String(200), nullable=True)
    state: Mapped[str | None] = mapped_column(String(200), nullable=True)
    saras_row: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True
    )
    planned_action: Mapped[str] = mapped_column(String(40), nullable=False, default="new")
    identity_status: Mapped[str] = mapped_column(String(40), nullable=False, default="new")
    kys_mapping_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    collection_status: Mapped[str] = mapped_column(String(40), nullable=False, default="discovered")
    validation_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    current_year: Mapped[str | None] = mapped_column(String(20), nullable=True)
    current_operation: Mapped[str | None] = mapped_column(String(200), nullable=True)
    years_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    years_complete: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    year_progress: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    warning_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    collection_run: Mapped[CollectionRun] = relationship(back_populates="school_items")


class SourceRecord(Base):
    __tablename__ = "source_records"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_source_records_idempotency_key"),
        Index("ix_source_records_school_source", "school_id", "source"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True
    )
    collection_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(120), nullable=False)
    academic_year: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    request_params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    payload_checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)

    collection_run: Mapped[CollectionRun | None] = relationship(back_populates="source_records")


class SchoolYearSnapshot(Base):
    __tablename__ = "school_year_snapshots"
    __table_args__ = (
        UniqueConstraint("school_id", "academic_year", "source", name="uq_school_year_snapshots_school_year_source"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    validation_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    data_quality: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    school: Mapped[School] = relationship(back_populates="snapshots")
    enrollment: Mapped[SchoolEnrollment | None] = relationship(back_populates="snapshot", uselist=False)


class SchoolEnrollment(Base):
    __tablename__ = "school_enrollment"
    __table_args__ = (
        UniqueConstraint("school_id", "academic_year", "source", name="uq_school_enrollment_school_year_source"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("school_year_snapshots.id", ondelete="SET NULL"), nullable=True
    )
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    total_enrollment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rte_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    snapshot: Mapped[SchoolYearSnapshot | None] = relationship(back_populates="enrollment")
    grades: Mapped[list[SchoolEnrollmentGrade]] = relationship(back_populates="enrollment", cascade="all, delete-orphan")


class SchoolEnrollmentGrade(Base):
    __tablename__ = "school_enrollment_grade"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "grade_label", name="uq_school_enrollment_grade_enrollment_label"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("school_enrollment.id", ondelete="CASCADE"), nullable=False
    )
    grade_label: Mapped[str] = mapped_column(String(40), nullable=False)
    boys: Mapped[int | None] = mapped_column(Integer, nullable=True)
    girls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )

    enrollment: Mapped[SchoolEnrollment] = relationship(back_populates="grades")


class SchoolStudentDistribution(Base):
    __tablename__ = "school_student_distribution"
    __table_args__ = (
        UniqueConstraint(
            "school_id", "academic_year", "source", "distribution_type",
            name="uq_school_student_distribution_key",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    distribution_type: Mapped[str] = mapped_column(String(80), nullable=False)
    reported_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    buckets: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    data_quality: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SchoolStudentIndicators(Base):
    __tablename__ = "school_student_indicators"
    __table_args__ = (
        UniqueConstraint("school_id", "academic_year", "source", "indicator_key", name="uq_school_student_indicators_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    indicator_key: Mapped[str] = mapped_column(String(120), nullable=False)
    indicator_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SchoolTeacherYear(Base):
    __tablename__ = "school_teacher_year"
    __table_args__ = (
        UniqueConstraint("school_id", "academic_year", "source", name="uq_school_teacher_year_school_year_source"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    teacher_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SchoolInfrastructureYear(Base):
    __tablename__ = "school_infrastructure_year"
    __table_args__ = (
        UniqueConstraint("school_id", "academic_year", "source", name="uq_school_infrastructure_year_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SchoolFacility(Base):
    __tablename__ = "school_facilities"
    __table_args__ = (
        UniqueConstraint("school_id", "academic_year", "facility_key", "source", name="uq_school_facilities_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    academic_year: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    facility_key: Mapped[str] = mapped_column(String(120), nullable=False)
    facility_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SchoolAffiliation(Base):
    __tablename__ = "school_affiliations"
    __table_args__ = (
        UniqueConstraint("school_id", "affiliation_type", "affiliation_number", name="uq_school_affiliations_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    affiliation_type: Mapped[str] = mapped_column(String(60), nullable=False)
    affiliation_number: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    valid_from: Mapped[str | None] = mapped_column(String(20), nullable=True)
    valid_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SchoolContact(Base):
    __tablename__ = "school_contacts"
    __table_args__ = (
        UniqueConstraint("school_id", "contact_type", "contact_value", name="uq_school_contacts_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    contact_type: Mapped[str] = mapped_column(String(60), nullable=False)
    contact_value: Mapped[str] = mapped_column(String(300), nullable=False)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SchoolMetric(Base):
    __tablename__ = "school_metrics"
    __table_args__ = (
        UniqueConstraint("school_id", "metric_key", "academic_year", name="uq_school_metrics_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    academic_year: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    metric_key: Mapped[str] = mapped_column(String(120), nullable=False)
    metric_value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    metric_value_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="derived")
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SchoolProspect(Base):
    __tablename__ = "school_prospects"
    __table_args__ = (UniqueConstraint("school_id", name="uq_school_prospects_school_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[str] = mapped_column(String(40), nullable=False, default="intelligence")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    basic_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    school: Mapped[School] = relationship(back_populates="prospects")


class CapabbleTenant(Base):
    """Future bridge: one Capabble tenant maps to exactly one canonical school."""

    __tablename__ = "capabble_tenants"
    __table_args__ = (
        UniqueConstraint("school_id", name="uq_capabble_tenants_school_id"),
        UniqueConstraint("tenant_slug", name="uq_capabble_tenants_tenant_slug"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    tenant_slug: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    tenant_mongo_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    link_status: Mapped[str] = mapped_column(String(40), nullable=False, default="unlinked")
    linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    school: Mapped[School] = relationship(back_populates="capabble_tenant")


class SarasSchoolRecord(Base):
    __tablename__ = "saras_school_records"
    __table_args__ = (UniqueConstraint("affiliation_number", name="uq_saras_school_records_affiliation"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    affiliation_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    school_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    school_name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    state: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    district: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    status: Mapped[str | None] = mapped_column(String(120), nullable=True)
    head_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    address_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pin_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    website: Mapped[str | None] = mapped_column(String(300), nullable=True)
    detail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    detail_source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    raw_row: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    detail_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    parser_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    identity_match_method: Mapped[str | None] = mapped_column(String(60), nullable=True)
    identity_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    requires_manual_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MatchCandidate(Base):
    __tablename__ = "match_candidates"

    id: Mapped[uuid.UUID] = _uuid_pk()
    source: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    saras_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("saras_school_records.id", ondelete="SET NULL"), nullable=True
    )
    source_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    candidate_school_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    matching_method: Mapped[str] = mapped_column(String(60), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    matched_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    mismatch_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    requires_manual_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    decision_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class KysMappingCandidate(Base):
    """KYS source-mapping candidate evidence (not canonical identity match)."""

    __tablename__ = "kys_mapping_candidates"
    __table_args__ = (
        Index("ix_kys_mapping_candidates_school_status", "school_id", "decision_status"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    school_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kys_school_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    udise: Mapped[str | None] = mapped_column(String(20), nullable=True)
    matching_method: Mapped[str] = mapped_column(String(60), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_label: Mapped[str] = mapped_column(String(20), nullable=False)
    candidate_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    matched_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    mismatch_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    decision_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending", index=True)
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
