from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from school_intel.api.deps import DbSession, ScholRole, require_collection_access
from school_intel.domain.collection_constants import ACADEMIC_YEARS, ALL_DATA_GROUPS
from school_intel.domain.enums import CollectionRunStatus
from school_intel.repositories.batch_collection_repository import BatchCollectionRepository
from school_intel.services.batch_collection_orchestrator import BatchCollectionOrchestrator
from school_intel.services.collection_preview_service import CollectionPreviewService

router = APIRouter(prefix="/api/collection", tags=["collection"])


class CollectionPreviewRequest(BaseModel):
    source: str = "saras"
    state_id: str
    state_name: str
    district_id: str
    district_name: str
    year_from: str = "2018-19"
    year_to: str = "2025-26"
    data_groups: list[str] = Field(default_factory=lambda: ALL_DATA_GROUPS.copy())


class CollectionRunCreateRequest(CollectionPreviewRequest):
    school_limit: str | int = "all"
    options: dict = Field(
        default_factory=lambda: {
            "skip_complete": True,
            "resume_incomplete": True,
            "skip_completed_endpoints": True,
        }
    )
    start_immediately: bool = False


@router.post("/preview")
def preview_collection(payload: CollectionPreviewRequest, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    service = CollectionPreviewService(db)
    try:
        return service.preview(**payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        service.close()


@router.post("/runs")
def create_collection_run(
    payload: CollectionRunCreateRequest,
    db: DbSession,
    role: ScholRole,
    background_tasks: BackgroundTasks,
) -> dict:
    require_collection_access(role)
    orchestrator = BatchCollectionOrchestrator(db)
    try:
        run_id = orchestrator.create_run(payload.model_dump(), requested_by=role)
        run = orchestrator.run_repo.get(run_id)
        if payload.start_immediately:
            orchestrator.run_repo.mark_running(run_id)
            db.commit()
            orchestrator.start_run_async(run_id)
        return {"run_id": str(run_id), "status": run.status if run else CollectionRunStatus.PENDING.value}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        orchestrator.close()


@router.get("/runs")
def list_collection_runs(db: DbSession, role: ScholRole, limit: int = 50) -> dict:
    require_collection_access(role)
    repo = BatchCollectionRepository(db)
    orchestrator = BatchCollectionOrchestrator(db)
    try:
        runs = repo.list_runs(limit=limit)
        items: list[dict] = []
        for run in runs:
            schools = repo.list_run_schools(run.id)
            status_counts = repo.count_schools_by_status(run.id)
            summary = orchestrator.build_run_summary_payload(run, schools, status_counts)
            items.append(
                {
                    "run_id": summary["run_id"],
                    "source": summary["source"],
                    "status": summary["status"],
                    "pipeline": summary["pipeline"],
                    "pipeline_description": summary["pipeline_description"],
                    "parameters": summary["parameters"],
                    "state": (run.parameters or {}).get("state_name"),
                    "district": (run.parameters or {}).get("district_name"),
                    "total_count": summary["total_count"],
                    "processed_count": summary["processed_count"],
                    "failed_count": summary["failed_count"],
                    "overall_percent": summary["overall_percent"],
                    "status_counts": summary["status_counts"],
                    "started_at": summary["started_at"],
                    "completed_at": summary["completed_at"],
                }
            )
        return {"runs": items}
    finally:
        orchestrator.close()


@router.get("/runs/{run_id}")
def get_collection_run(run_id: str, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    orchestrator = BatchCollectionOrchestrator(db)
    try:
        return orchestrator.get_run_summary(UUID(run_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        orchestrator.close()


@router.get("/runs/{run_id}/summary")
def get_collection_run_summary(run_id: str, db: DbSession, role: ScholRole) -> dict:
    return get_collection_run(run_id, db, role)


@router.get("/runs/{run_id}/schools")
def get_collection_run_schools(run_id: str, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    orchestrator = BatchCollectionOrchestrator(db)
    try:
        return {"schools": orchestrator.list_run_schools(UUID(run_id))}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        orchestrator.close()


@router.post("/runs/{run_id}/pause")
def pause_collection_run(run_id: str, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    repo = BatchCollectionRepository(db)
    try:
        run = repo.pause_run(UUID(run_id))
        db.commit()
        return {"run_id": str(run.id), "status": run.status}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/runs/{run_id}/resume")
def resume_collection_run(run_id: str, db: DbSession, role: ScholRole, background_tasks: BackgroundTasks) -> dict:
    require_collection_access(role)
    orchestrator = BatchCollectionOrchestrator(db)
    try:
        run = orchestrator.run_repo.mark_running(UUID(run_id))
        db.commit()
        orchestrator.start_run_async(run.id)
        return {"run_id": str(run.id), "status": run.status}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        orchestrator.close()


@router.post("/runs/{run_id}/cancel")
def cancel_collection_run(run_id: str, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    repo = BatchCollectionRepository(db)
    try:
        run = repo.cancel_run(UUID(run_id))
        db.commit()
        return {"run_id": str(run.id), "status": run.status}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/years")
def list_academic_years() -> dict:
    return {"years": ACADEMIC_YEARS}
