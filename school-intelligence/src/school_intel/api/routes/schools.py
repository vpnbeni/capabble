from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from school_intel.api.deps import DbSession, ScholRole, require_raw_access
from school_intel.services.directory_service import DirectoryService
from school_intel.services.profile_service import ProfileService

router = APIRouter(prefix="/api/schools", tags=["schools"])


def _parse_school_id(school_id: str) -> UUID:
    try:
        return UUID(school_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid school ID") from None


@router.get("")
def list_schools(
    db: DbSession,
    q: str | None = None,
    state: str | None = None,
    district: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    return DirectoryService(db).list_schools(q=q, state=state, district=district, page=page, limit=limit)


@router.get("/{school_id}")
def get_school_profile(
    school_id: str,
    db: DbSession,
    year: str | None = Query(None, alias="year"),
) -> dict:
    service = ProfileService(db)
    try:
        return service.build_profile(_parse_school_id(school_id), selected_year=year)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{school_id}/overview")
def get_overview(school_id: str, db: DbSession, year: str | None = None) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id), selected_year=year)
    return {"overview": profile["overview"], "header": profile["header"]}


@router.get("/{school_id}/enrollment")
def get_enrollment(school_id: str, db: DbSession) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id))
    return {"enrollment": profile["enrollment"]}


@router.get("/{school_id}/enrollment/{academic_year}")
def get_enrollment_year(school_id: str, academic_year: str, db: DbSession) -> dict:
    return ProfileService(db).get_year_detail(_parse_school_id(school_id), academic_year)


@router.get("/{school_id}/students")
def get_students(school_id: str, db: DbSession, year: str | None = None) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id), selected_year=year)
    detail = ProfileService(db).get_year_detail(_parse_school_id(school_id), year or profile["overview"]["selected_year"])
    return {"students": profile["students"], "year_detail": detail}


@router.get("/{school_id}/staff")
def get_staff(school_id: str, db: DbSession) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id))
    return {"staff": profile["staff"]}


@router.get("/{school_id}/facilities")
def get_facilities(school_id: str, db: DbSession, year: str | None = None) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id), selected_year=year)
    return {
        "facilities": profile["facilities"],
        "facility_history": profile["facility_history"],
    }


@router.get("/{school_id}/history")
def get_history(school_id: str, db: DbSession) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id))
    years = []
    for row in profile["enrollment"]["series"]:
        year = row["year"]
        staff = next((s for s in profile["staff"]["series"] if s["year"] == year), None)
        years.append({
            "year": year,
            "enrollment": row["total"],
            "teachers": staff["total"] if staff else None,
            "student_teacher_ratio": next(
                (r["ratio"] for r in profile["staff"]["student_teacher_ratio_series"] if r["year"] == year),
                None,
            ),
        })
    return {"years": years}


@router.get("/{school_id}/sources")
def get_sources(school_id: str, db: DbSession) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id))
    return {"sources": profile["sources"]}


@router.get("/{school_id}/intelligence")
def get_intelligence(school_id: str, db: DbSession) -> dict:
    profile = ProfileService(db).build_profile(_parse_school_id(school_id))
    return {
        "intelligence": profile["intelligence"],
        "data_quality": profile["data_quality"],
    }


@router.get("/{school_id}/raw")
def get_raw_sources(school_id: str, db: DbSession, role: ScholRole) -> dict:
    require_raw_access(role)
    try:
        return ProfileService(db).get_raw_sources(_parse_school_id(school_id), role)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
