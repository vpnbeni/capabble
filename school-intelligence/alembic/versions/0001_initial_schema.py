"""Initial School Intelligence schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "schools",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("canonical_name", sa.String(length=500), nullable=False),
        sa.Column("normalized_name", sa.String(length=500), nullable=False),
        sa.Column("address_line", sa.Text(), nullable=True),
        sa.Column("district", sa.String(length=200), nullable=True),
        sa.Column("state", sa.String(length=200), nullable=True),
        sa.Column("pin_code", sa.String(length=20), nullable=True),
        sa.Column("validation_status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("data_quality", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_schools_normalized_name", "schools", ["normalized_name"])
    op.create_index("ix_schools_district", "schools", ["district"])
    op.create_index("ix_schools_state", "schools", ["state"])
    op.create_index("ix_schools_pin_code", "schools", ["pin_code"])

    op.create_table(
        "collection_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("run_type", sa.String(length=40), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("parameters", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("cursor_value", sa.String(length=200), nullable=True),
        sa.Column("total_count", sa.Integer(), nullable=True),
        sa.Column("processed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_collection_runs_status", "collection_runs", ["status"])
    op.create_index("ix_collection_runs_status_source", "collection_runs", ["status", "source"])

    op.create_table(
        "source_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("collection_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collection_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("endpoint", sa.String(length=120), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=True),
        sa.Column("request_params", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("payload_checksum", sa.String(length=64), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_source_records_idempotency_key"),
    )
    op.create_index("ix_source_records_school_id", "source_records", ["school_id"])
    op.create_index("ix_source_records_collection_run_id", "source_records", ["collection_run_id"])
    op.create_index("ix_source_records_source", "source_records", ["source"])
    op.create_index("ix_source_records_academic_year", "source_records", ["academic_year"])
    op.create_index("ix_source_records_school_source", "source_records", ["school_id", "source"])

    op.create_table(
        "school_identifiers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("identifier_type", sa.String(length=60), nullable=False),
        sa.Column("identifier_value", sa.String(length=120), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="manual"),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("identifier_type", "identifier_value", name="uq_school_identifiers_type_value"),
    )
    op.create_index("ix_school_identifiers_identifier_type", "school_identifiers", ["identifier_type"])
    op.create_index("ix_school_identifiers_identifier_value", "school_identifiers", ["identifier_value"])
    op.create_index("ix_school_identifiers_school_type", "school_identifiers", ["school_id", "identifier_type"])

    op.create_table(
        "school_year_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("validation_status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("data_quality", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("school_id", "academic_year", "source", name="uq_school_year_snapshots_school_year_source"),
    )
    op.create_index("ix_school_year_snapshots_academic_year", "school_year_snapshots", ["academic_year"])

    op.create_table(
        "school_enrollment",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("school_year_snapshots.id", ondelete="SET NULL"), nullable=True),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total_enrollment", sa.Integer(), nullable=True),
        sa.Column("rte_count", sa.Integer(), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("school_id", "academic_year", "source", name="uq_school_enrollment_school_year_source"),
    )
    op.create_index("ix_school_enrollment_academic_year", "school_enrollment", ["academic_year"])

    op.create_table(
        "school_enrollment_grade",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("enrollment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("school_enrollment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grade_label", sa.String(length=40), nullable=False),
        sa.Column("boys", sa.Integer(), nullable=True),
        sa.Column("girls", sa.Integer(), nullable=True),
        sa.Column("total", sa.Integer(), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("enrollment_id", "grade_label", name="uq_school_enrollment_grade_enrollment_label"),
    )

    op.create_table(
        "school_student_distribution",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("distribution_type", sa.String(length=80), nullable=False),
        sa.Column("reported_total", sa.Integer(), nullable=True),
        sa.Column("buckets", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("validation_status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("data_quality", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("school_id", "academic_year", "source", "distribution_type", name="uq_school_student_distribution_key"),
    )
    op.create_index("ix_school_student_distribution_academic_year", "school_student_distribution", ["academic_year"])

    op.create_table(
        "school_student_indicators",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("indicator_key", sa.String(length=120), nullable=False),
        sa.Column("indicator_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("school_id", "academic_year", "source", "indicator_key", name="uq_school_student_indicators_key"),
    )
    op.create_index("ix_school_student_indicators_academic_year", "school_student_indicators", ["academic_year"])

    op.create_table(
        "school_teacher_year",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("teacher_count", sa.Integer(), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("school_id", "academic_year", "source", name="uq_school_teacher_year_school_year_source"),
    )
    op.create_index("ix_school_teacher_year_academic_year", "school_teacher_year", ["academic_year"])

    op.create_table(
        "school_infrastructure_year",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("school_id", "academic_year", "source", name="uq_school_infrastructure_year_key"),
    )
    op.create_index("ix_school_infrastructure_year_academic_year", "school_infrastructure_year", ["academic_year"])

    op.create_table(
        "school_facilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("facility_key", sa.String(length=120), nullable=False),
        sa.Column("facility_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("school_id", "academic_year", "facility_key", "source", name="uq_school_facilities_key"),
    )
    op.create_index("ix_school_facilities_academic_year", "school_facilities", ["academic_year"])

    op.create_table(
        "school_affiliations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("affiliation_type", sa.String(length=60), nullable=False),
        sa.Column("affiliation_number", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=80), nullable=True),
        sa.Column("valid_from", sa.String(length=20), nullable=True),
        sa.Column("valid_to", sa.String(length=20), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("school_id", "affiliation_type", "affiliation_number", name="uq_school_affiliations_key"),
    )

    op.create_table(
        "school_contacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_type", sa.String(length=60), nullable=False),
        sa.Column("contact_value", sa.String(length=300), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("school_id", "contact_type", "contact_value", name="uq_school_contacts_key"),
    )

    op.create_table(
        "school_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(length=20), nullable=True),
        sa.Column("metric_key", sa.String(length=120), nullable=False),
        sa.Column("metric_value_numeric", sa.Float(), nullable=True),
        sa.Column("metric_value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="derived"),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("school_id", "metric_key", "academic_year", name="uq_school_metrics_key"),
    )
    op.create_index("ix_school_metrics_academic_year", "school_metrics", ["academic_year"])

    op.create_table(
        "school_prospects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", sa.String(length=40), nullable=False, server_default="intelligence"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("basic_metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("school_id", name="uq_school_prospects_school_id"),
    )

    op.create_table(
        "capabble_tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_slug", sa.String(length=120), nullable=True),
        sa.Column("tenant_mongo_id", sa.String(length=40), nullable=True),
        sa.Column("link_status", sa.String(length=40), nullable=False, server_default="unlinked"),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("school_id", name="uq_capabble_tenants_school_id"),
        sa.UniqueConstraint("tenant_slug", name="uq_capabble_tenants_tenant_slug"),
    )
    op.create_index("ix_capabble_tenants_tenant_slug", "capabble_tenants", ["tenant_slug"])


def downgrade() -> None:
    op.drop_table("capabble_tenants")
    op.drop_table("school_prospects")
    op.drop_table("school_metrics")
    op.drop_table("school_contacts")
    op.drop_table("school_affiliations")
    op.drop_table("school_facilities")
    op.drop_table("school_infrastructure_year")
    op.drop_table("school_teacher_year")
    op.drop_table("school_student_indicators")
    op.drop_table("school_student_distribution")
    op.drop_table("school_enrollment_grade")
    op.drop_table("school_enrollment")
    op.drop_table("school_year_snapshots")
    op.drop_table("school_identifiers")
    op.drop_table("source_records")
    op.drop_table("collection_runs")
    op.drop_table("schools")
