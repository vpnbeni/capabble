from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from school_intel.api.deps import DbSession, ScholRole, require_collection_access
from school_intel.db.models import CollectionRun, School
from school_intel.domain.enums import CollectionRunStatus, CollectionRunType, KysMappingMethod
from school_intel.services.kys_bulk_import_service import KysBulkImportService
from school_intel.services.kys_mapping_resolver import KysMappingResolver

router = APIRouter(prefix="/api/kys-mapping", tags=["kys-mapping"])


class VerifyKysMappingRequest(BaseModel):
    kys_school_id: str = Field(..., min_length=1, max_length=20)


class ConfirmKysMappingRequest(BaseModel):
    kys_school_id: str = Field(..., min_length=1, max_length=20)
    udise: str | None = None
    allow_review_override: bool = False


class BulkImportKysMappingRequest(BaseModel):
    raw_text: str = Field(..., min_length=1)
    district: str | None = None
    auto_confirm: bool = True


@router.get("/schools/{school_id}")
def get_kys_mapping(school_id: str, db: DbSession) -> dict:
    try:
        parsed_id = UUID(school_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid school ID") from None

    resolver = KysMappingResolver(db)
    try:
        result = resolver.resolve(parsed_id, persist=False)
        return result.model_dump(mode="json")
    finally:
        resolver.close()


@router.post("/schools/{school_id}/verify")
def verify_kys_mapping(
    school_id: str,
    body: VerifyKysMappingRequest,
    db: DbSession,
    role: ScholRole,
) -> dict:
    require_collection_access(role)
    try:
        parsed_id = UUID(school_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid school ID") from None

    resolver = KysMappingResolver(db)
    try:
        verification = resolver.verify_kys_id(parsed_id, body.kys_school_id)
        return verification.model_dump(mode="json")
    finally:
        resolver.close()


@router.post("/schools/{school_id}/confirm")
def confirm_kys_mapping(
    school_id: str,
    body: ConfirmKysMappingRequest,
    db: DbSession,
    role: ScholRole,
) -> dict:
    require_collection_access(role)
    try:
        parsed_id = UUID(school_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid school ID") from None

    resolver = KysMappingResolver(db)
    try:
        result = resolver.confirm_manual_mapping(
            parsed_id,
            body.kys_school_id,
            method=KysMappingMethod.OPERATOR_CONFIRMED,
            udise_override=body.udise,
            allow_review_override=body.allow_review_override,
        )
        db.commit()
        return result.model_dump(mode="json")
    finally:
        resolver.close()


@router.post("/bulk-import")
def bulk_import_kys_mapping(
    body: BulkImportKysMappingRequest,
    db: DbSession,
    role: ScholRole,
) -> dict:
    """Match a pasted raw KYS API response (e.g. an Advance Search district
    listing, retrieved by a human who solved the CAPTCHA themselves) against
    pending SCHOL schools. High-confidence matches are independently
    re-verified live before being persisted — the pasted data is never
    trusted blindly."""
    require_collection_access(role)
    try:
        raw = json.loads(body.raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    service = KysBulkImportService(db)
    try:
        return service.import_dump(raw, district=body.district, auto_confirm=body.auto_confirm)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/active-syncs")
def list_active_kys_syncs(db: DbSession) -> dict:
    """Currently-running single-school KYS sync jobs, regardless of which
    page (if any) started them — lets the frontend restore a progress toast
    after a reload or tab switch instead of losing track of it."""
    runs = (
        db.execute(
            select(CollectionRun).where(
                CollectionRun.run_type == CollectionRunType.SCHOOL.value,
                CollectionRun.status == CollectionRunStatus.RUNNING.value,
            )
        )
        .scalars()
        .all()
    )

    items = []
    for run in runs:
        school_id = (run.parameters or {}).get("school_id")
        school = db.get(School, UUID(school_id)) if school_id else None
        items.append(
            {
                "run_id": str(run.id),
                "school_id": school_id,
                "school_name": school.canonical_name if school else None,
                "status": run.status,
                "current_year": run.cursor_value,
                "processed_count": run.processed_count,
                "failed_count": run.failed_count,
                "started_at": run.started_at.isoformat() if run.started_at else None,
            }
        )
    return {"active_syncs": items}
