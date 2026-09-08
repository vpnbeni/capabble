from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from school_intel.db.models import CollectionRun, CollectionRunSchool
from school_intel.domain.enums import CollectionRunStatus


class BatchCollectionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_run_school(self, **kwargs) -> CollectionRunSchool:
        item = CollectionRunSchool(**kwargs)
        self.session.add(item)
        self.session.flush()
        return item

    def list_run_schools(self, run_id: UUID) -> list[CollectionRunSchool]:
        return list(
            self.session.scalars(
                select(CollectionRunSchool)
                .where(CollectionRunSchool.collection_run_id == run_id)
                .order_by(CollectionRunSchool.position)
            ).all()
        )

    def get_run_school(self, item_id: UUID) -> CollectionRunSchool | None:
        return self.session.get(CollectionRunSchool, item_id)

    def update_run_school(self, item: CollectionRunSchool) -> CollectionRunSchool:
        self.session.flush()
        return item

    def list_runs(self, limit: int = 50) -> list[CollectionRun]:
        return list(
            self.session.scalars(
                select(CollectionRun).order_by(CollectionRun.created_at.desc()).limit(limit)
            ).all()
        )

    def set_total_count(self, run_id: UUID, total_count: int) -> CollectionRun:
        run = self.session.get(CollectionRun, run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")
        run.total_count = total_count
        self.session.flush()
        return run

    def pause_run(self, run_id: UUID) -> CollectionRun:
        run = self.session.get(CollectionRun, run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")
        run.status = CollectionRunStatus.PAUSED.value
        self.session.flush()
        return run

    def cancel_run(self, run_id: UUID) -> CollectionRun:
        run = self.session.get(CollectionRun, run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")
        run.status = CollectionRunStatus.CANCELLED.value
        self.session.flush()
        return run

    def count_schools_by_status(self, run_id: UUID) -> dict[str, int]:
        rows = self.session.execute(
            select(CollectionRunSchool.collection_status, func.count())
            .where(CollectionRunSchool.collection_run_id == run_id)
            .group_by(CollectionRunSchool.collection_status)
        ).all()
        return {status: count for status, count in rows}
