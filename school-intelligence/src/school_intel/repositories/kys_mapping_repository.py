from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from school_intel.db.models import KysMappingCandidate
from school_intel.domain.enums import MatchDecisionStatus


class KysMappingRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_candidate(
        self,
        *,
        school_id: UUID,
        kys_school_id: str | None,
        udise: str | None,
        matching_method: str,
        confidence_score: float,
        confidence_label: str,
        candidate_payload: dict,
        matched_fields: dict | None,
        mismatch_fields: dict | None,
        provenance: dict | None = None,
    ) -> KysMappingCandidate:
        existing = self.session.scalar(
            select(KysMappingCandidate).where(
                KysMappingCandidate.school_id == school_id,
                KysMappingCandidate.kys_school_id == kys_school_id,
                KysMappingCandidate.matching_method == matching_method,
                KysMappingCandidate.decision_status == MatchDecisionStatus.PENDING.value,
            )
        )
        if existing:
            existing.confidence_score = confidence_score
            existing.confidence_label = confidence_label
            existing.candidate_payload = candidate_payload
            existing.matched_fields = matched_fields
            existing.mismatch_fields = mismatch_fields
            existing.udise = udise
            existing.provenance = provenance
            self.session.flush()
            return existing

        row = KysMappingCandidate(
            school_id=school_id,
            kys_school_id=kys_school_id,
            udise=udise,
            matching_method=matching_method,
            confidence_score=confidence_score,
            confidence_label=confidence_label,
            candidate_payload=candidate_payload,
            matched_fields=matched_fields,
            mismatch_fields=mismatch_fields,
            provenance=provenance,
            decision_status=MatchDecisionStatus.PENDING.value,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def list_pending(self, school_id: UUID) -> list[KysMappingCandidate]:
        return list(
            self.session.scalars(
                select(KysMappingCandidate)
                .where(
                    KysMappingCandidate.school_id == school_id,
                    KysMappingCandidate.decision_status == MatchDecisionStatus.PENDING.value,
                )
                .order_by(KysMappingCandidate.confidence_score.desc())
            ).all()
        )

    def reject_pending(self, school_id: UUID) -> None:
        rows = self.list_pending(school_id)
        for row in rows:
            row.decision_status = MatchDecisionStatus.REJECTED.value
        self.session.flush()
