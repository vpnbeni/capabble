from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from school_intel.api.deps import DbSession, ScholRole, require_collection_access
from school_intel.domain.enums import KysMappingMethod
from school_intel.services.kys_mapping_resolver import KysMappingResolver

router = APIRouter(prefix="/api/kys-mapping", tags=["kys-mapping"])


class VerifyKysMappingRequest(BaseModel):
    kys_school_id: str = Field(..., min_length=1, max_length=20)


class ConfirmKysMappingRequest(BaseModel):
    kys_school_id: str = Field(..., min_length=1, max_length=20)
    udise: str | None = None


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
        )
        db.commit()
        return result.model_dump(mode="json")
    finally:
        resolver.close()
