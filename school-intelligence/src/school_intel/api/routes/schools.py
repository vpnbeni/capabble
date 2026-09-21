from __future__ import annotations

import logging
import threading
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from school_intel.api.deps import DbSession, ScholRole, require_collection_access, require_raw_access
from school_intel.db.models import CollectionRun, School
from school_intel.domain.enums import CollectionRunStatus, IdentifierType
from school_intel.services.collection_service import KysCollectionService
from school_intel.services.directory_service import DirectoryService
from school_intel.services.profile_service import ProfileService

router = APIRouter(prefix="/api/schools", tags=["schools"])
logger = logging.getLogger("school_intel.api.schools")


def _parse_uuid(value: str, *, label: str = "ID") -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from None


def _parse_school_id(school_id: str) -> UUID:
    return _parse_uuid(school_id, label="school ID")


@router.get("")
def list_schools(
    db: DbSession,
    q: str | None = None,
    state: str | None = None,
    district: str | None = None,
    kys_status: str | None = None,
    validation_status: str | None = None,
    sort: str = "name",
    order: str = "asc",
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    return DirectoryService(db).list_schools(
        q=q,
        state=state,
        district=district,
        kys_status=kys_status,
        validation_status=validation_status,
        sort=sort,
        order=order,
        page=page,
        limit=limit,
    )


@router.get("/filter-options")
def get_school_filter_options(db: DbSession) -> dict:
    return DirectoryService(db).list_filter_options()


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


def _run_kys_sync_in_background(run_id: UUID, udise: str, kys_id: str, state_code: str | None) -> None:
    from school_intel.db.session import session_scope

    with session_scope() as session:
        run = session.get(CollectionRun, run_id)
        if not run:
            return
        school_id = UUID(run.parameters["school_id"]) if run.parameters and run.parameters.get("school_id") else None
        school = session.get(School, school_id) if school_id else None
        if not school:
            return
        service = KysCollectionService(session)
        try:
            service.run_school_collection(school, kys_id, run, udise)
        except Exception:
            logger.exception("kys_sync_background_failed run_id=%s", run_id)
        finally:
            if service._owns_collector:
                service.collector.close()


@router.post("/{school_id}/sync-kys")
def sync_kys_data(school_id: str, db: DbSession, role: ScholRole) -> dict:
    """Start an on-demand KYS historical collection for a single, already-
    mapped school — same underlying collector used by batch collection runs,
    just for one school without needing a full district run. Returns
    immediately with a run_id; the actual multi-year collection continues in
    a background thread (poll GET .../sync-kys/{run_id} for progress)."""
    require_collection_access(role)
    parsed_id = _parse_school_id(school_id)
    school = db.get(School, parsed_id)
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    kys_id = udise = state_code = None
    for ident in school.identifiers:
        if ident.identifier_type == IdentifierType.KYS_SCHOOL_ID.value and ident.is_verified:
            kys_id = ident.identifier_value
        if ident.identifier_type == IdentifierType.UDISE.value:
            udise = ident.identifier_value
        if ident.identifier_type == IdentifierType.STATE_SCHOOL_CODE.value:
            state_code = ident.identifier_value

    if not kys_id:
        raise HTTPException(status_code=400, detail="School is not KYS-mapped yet — resolve its KYS ID first.")
    if not udise:
        raise HTTPException(status_code=400, detail="School has no UDISE code on file.")

    service = KysCollectionService(db)
    try:
        # Fast path: we already trust this school's verified KYS identifier,
        # so skip the live identity re-verification `start_school_collection`
        # would otherwise do (year discovery + report-card + profile fetch) —
        # that's real network work, not "fast setup", and would defeat the
        # point of returning a run_id immediately.
        run = service.create_run_for_school(school, kys_id, udise)
        db.commit()
        run_id = run.id
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    thread = threading.Thread(
        target=_run_kys_sync_in_background,
        args=(run_id, udise, kys_id, state_code),
        daemon=True,
    )
    thread.start()

    return {"school_id": school_id, "run_id": str(run_id), "status": "running"}


def _run_status_payload(run: CollectionRun) -> dict:
    return {
        "run_id": str(run.id),
        "school_id": (run.parameters or {}).get("school_id"),
        "status": run.status,
        "current_year": run.cursor_value,
        "processed_count": run.processed_count,
        "failed_count": run.failed_count,
        "error_summary": run.error_summary,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


@router.get("/{school_id}/sync-kys/{run_id}")
def get_kys_sync_status(school_id: str, run_id: str, db: DbSession) -> dict:
    run = db.get(CollectionRun, _parse_uuid(run_id, label="run ID"))
    if not run or (run.parameters or {}).get("school_id") != school_id:
        raise HTTPException(status_code=404, detail="Sync run not found")
    return _run_status_payload(run)


@router.post("/{school_id}/sync-kys/{run_id}/cancel")
def cancel_kys_sync(school_id: str, run_id: str, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    run = db.get(CollectionRun, _parse_uuid(run_id, label="run ID"))
    if not run or (run.parameters or {}).get("school_id") != school_id:
        raise HTTPException(status_code=404, detail="Sync run not found")
    if run.status == CollectionRunStatus.RUNNING.value:
        run.status = CollectionRunStatus.CANCELLED.value
        db.commit()
    return _run_status_payload(run)
