"""Add collection_run_schools for batch collection progress tracking."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_batch_run_schools"
down_revision = "0002_saras_match_candidates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collection_run_schools",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("collection_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collection_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("affiliation_number", sa.String(length=40), nullable=False),
        sa.Column("school_name", sa.String(length=500), nullable=False),
        sa.Column("school_code", sa.String(length=40), nullable=True),
        sa.Column("district", sa.String(length=200), nullable=True),
        sa.Column("state", sa.String(length=200), nullable=True),
        sa.Column("saras_row", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("planned_action", sa.String(length=40), nullable=False, server_default="new"),
        sa.Column("identity_status", sa.String(length=40), nullable=False, server_default="new"),
        sa.Column("kys_mapping_status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("collection_status", sa.String(length=40), nullable=False, server_default="discovered"),
        sa.Column("validation_status", sa.String(length=40), nullable=True),
        sa.Column("current_year", sa.String(length=20), nullable=True),
        sa.Column("current_operation", sa.String(length=200), nullable=True),
        sa.Column("years_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("years_complete", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("year_progress", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("warning_summary", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_collection_run_schools_run_id", "collection_run_schools", ["collection_run_id"])
    op.create_index("ix_collection_run_schools_affiliation", "collection_run_schools", ["affiliation_number"])
    op.create_index("ix_collection_run_schools_school_id", "collection_run_schools", ["school_id"])
    op.create_index("ix_collection_run_schools_run_status", "collection_run_schools", ["collection_run_id", "collection_status"])


def downgrade() -> None:
    op.drop_index("ix_collection_run_schools_run_status", table_name="collection_run_schools")
    op.drop_index("ix_collection_run_schools_school_id", table_name="collection_run_schools")
    op.drop_index("ix_collection_run_schools_affiliation", table_name="collection_run_schools")
    op.drop_index("ix_collection_run_schools_run_id", table_name="collection_run_schools")
    op.drop_table("collection_run_schools")
