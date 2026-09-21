"""Add SARAS normalized records and identity match candidates."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_saras_match_candidates"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saras_school_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("affiliation_number", sa.String(length=40), nullable=False),
        sa.Column("school_code", sa.String(length=40), nullable=True),
        sa.Column("school_name", sa.String(length=500), nullable=False),
        sa.Column("normalized_name", sa.String(length=500), nullable=False),
        sa.Column("state", sa.String(length=200), nullable=True),
        sa.Column("district", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=120), nullable=True),
        sa.Column("head_name", sa.String(length=300), nullable=True),
        sa.Column("address_line", sa.Text(), nullable=True),
        sa.Column("normalized_address", sa.String(length=500), nullable=True),
        sa.Column("pin_code", sa.String(length=20), nullable=True),
        sa.Column("website", sa.String(length=300), nullable=True),
        sa.Column("detail_url", sa.String(length=500), nullable=True),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("detail_source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("raw_row", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("detail_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("parser_version", sa.String(length=20), nullable=False, server_default="1.0"),
        sa.Column("identity_match_method", sa.String(length=60), nullable=True),
        sa.Column("identity_confidence", sa.Float(), nullable=True),
        sa.Column("requires_manual_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("affiliation_number", name="uq_saras_school_records_affiliation"),
    )
    op.create_index("ix_saras_school_records_school_id", "saras_school_records", ["school_id"])
    op.create_index("ix_saras_school_records_normalized_name", "saras_school_records", ["normalized_name"])
    op.create_index("ix_saras_school_records_state_district", "saras_school_records", ["state", "district"])

    op.create_table(
        "match_candidates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("saras_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("saras_school_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("candidate_school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("matching_method", sa.String(length=60), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("matched_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("mismatch_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("requires_manual_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("decision_status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_match_candidates_source", "match_candidates", ["source"])
    op.create_index("ix_match_candidates_decision_status", "match_candidates", ["decision_status"])
    op.create_index("ix_match_candidates_candidate_school", "match_candidates", ["candidate_school_id"])


def downgrade() -> None:
    op.drop_table("match_candidates")
    op.drop_table("saras_school_records")
