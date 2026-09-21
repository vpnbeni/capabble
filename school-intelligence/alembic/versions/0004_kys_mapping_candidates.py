"""Alembic migration: kys_mapping_candidates table."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_kys_mapping_candidates"
down_revision = "0003_batch_run_schools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kys_mapping_candidates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kys_school_id", sa.String(length=40), nullable=True),
        sa.Column("udise", sa.String(length=20), nullable=True),
        sa.Column("matching_method", sa.String(length=60), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("confidence_label", sa.String(length=20), nullable=False),
        sa.Column("candidate_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("matched_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("mismatch_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("decision_status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("provenance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_kys_mapping_candidates_school_id", "kys_mapping_candidates", ["school_id"])
    op.create_index("ix_kys_mapping_candidates_decision_status", "kys_mapping_candidates", ["decision_status"])
    op.create_index(
        "ix_kys_mapping_candidates_school_status",
        "kys_mapping_candidates",
        ["school_id", "decision_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_kys_mapping_candidates_school_status", table_name="kys_mapping_candidates")
    op.drop_index("ix_kys_mapping_candidates_decision_status", table_name="kys_mapping_candidates")
    op.drop_index("ix_kys_mapping_candidates_school_id", table_name="kys_mapping_candidates")
    op.drop_table("kys_mapping_candidates")
