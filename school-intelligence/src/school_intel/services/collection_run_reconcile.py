"""Reconcile persisted collection run semantics without deleting data."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm.attributes import flag_modified

from school_intel.db.session import session_scope
from school_intel.domain.collection_contract import (
    CBSE_SCHOOL_INTELLIGENCE_PIPELINE,
    aggregate_run_progress,
    compute_stage_progress,
    derive_run_status,
    normalize_school_status,
    pipeline_metadata_for_source,
)
from school_intel.domain.enums import BatchSchoolCollectionStatus, CollectionRunStatus, DataSource
from school_intel.repositories.batch_collection_repository import BatchCollectionRepository
from school_intel.repositories.school_repository import CollectionRunRepository


def reconcile_run(run_id: UUID, *, dry_run: bool = False) -> dict:
    with session_scope() as session:
        run_repo = CollectionRunRepository(session)
        batch_repo = BatchCollectionRepository(session)
        run = run_repo.get(run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")

        items = batch_repo.list_run_schools(run_id)
        changes: dict = {"run_id": str(run_id), "schools": [], "run": {}}

        params = dict(run.parameters or {})
        if run.source == DataSource.SARAS.value and run.run_type == "batch":
            params.update(pipeline_metadata_for_source(DataSource.SARAS.value))

        for item in items:
            old_status = item.collection_status
            new_status = normalize_school_status(old_status)
            school_change = {"id": str(item.id), "affiliation": item.affiliation_number, "from": old_status, "to": new_status}
            if old_status != new_status:
                item.collection_status = new_status
                if new_status == BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value and not item.error_summary:
                    item.error_summary = "KYS school ID could not be resolved"
                school_change["updated"] = True
            else:
                school_change["updated"] = False
            changes["schools"].append(school_change)

        progress = aggregate_run_progress(items, run)
        params["stage_progress"] = progress["stage_progress"]
        run.parameters = params

        old_run_status = run.status
        new_run_status = derive_run_status(
            [item.collection_status for item in items],
            current_status=run.status,
        )
        run.processed_count = progress["processed_count"]
        run.status = new_run_status
        if new_run_status in {CollectionRunStatus.COMPLETED.value, CollectionRunStatus.PARTIAL.value} and not run.completed_at:
            from datetime import datetime, timezone

            run.completed_at = run.completed_at or datetime.now(timezone.utc)

        changes["run"] = {
            "status_from": old_run_status,
            "status_to": new_run_status,
            "processed_count": run.processed_count,
            "pipeline": params.get("pipeline_label"),
            "progress": progress,
        }

        if not dry_run:
            flag_modified(run, "parameters")
            session.commit()
        else:
            session.rollback()

        return changes


if __name__ == "__main__":
    import json
    import sys

    run_id = UUID(sys.argv[1]) if len(sys.argv) > 1 else UUID("83f109d9-43f5-4cb6-ae94-3b0f38e64743")
    result = reconcile_run(run_id)
    print(json.dumps(result, indent=2, default=str))
