from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from school_intel.api.deps import DbSession, ScholRole, require_collection_access
from school_intel.db.models import MatchCandidate
from school_intel.repositories.saras_repository import MatchCandidateRepository

router = APIRouter(prefix="/api/match-candidates", tags=["identity-review"])


@router.get("")
def list_match_candidates(db: DbSession, role: ScholRole, limit: int = 50) -> dict:
    require_collection_access(role)
    repo = MatchCandidateRepository(db)
    pending = repo.list_pending(limit=limit)
    return {
        "items": [
            {
                "id": str(row.id),
                "source": row.source,
                "matching_method": row.matching_method,
                "confidence_score": row.confidence_score,
                "candidate_school_id": str(row.candidate_school_id),
                "requires_manual_review": row.requires_manual_review,
                "matched_fields": row.matched_fields,
                "mismatch_fields": row.mismatch_fields,
                "source_payload": row.source_payload,
                "decision_status": row.decision_status,
            }
            for row in pending
        ]
    }


@router.post("/{candidate_id}/accept")
def accept_match_candidate(candidate_id: str, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    from school_intel.services.school_identity_service import SchoolIdentityService

    service = SchoolIdentityService(db)
    try:
        service.accept_match(UUID(candidate_id))
        db.commit()
        return {"id": candidate_id, "status": "accepted"}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{candidate_id}/reject")
def reject_match_candidate(candidate_id: str, db: DbSession, role: ScholRole) -> dict:
    require_collection_access(role)
    candidate = db.get(MatchCandidate, UUID(candidate_id))
    if not candidate:
        raise HTTPException(status_code=404, detail="Match candidate not found")
    candidate.decision_status = "rejected"
    db.commit()
    return {"id": candidate_id, "status": "rejected"}
