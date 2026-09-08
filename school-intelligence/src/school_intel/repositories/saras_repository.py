from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from school_intel.db.models import MatchCandidate, SarasSchoolRecord
from school_intel.domain.enums import MatchDecisionStatus


class SarasRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_affiliation(self, affiliation_number: str) -> SarasSchoolRecord | None:
        aff = affiliation_number.strip()
        return self.session.scalar(
            select(SarasSchoolRecord).where(SarasSchoolRecord.affiliation_number == aff)
        )

    def upsert_record(self, record: SarasSchoolRecord) -> SarasSchoolRecord:
        existing = self.get_by_affiliation(record.affiliation_number)
        if existing:
            for field in (
                "school_code", "school_name", "normalized_name", "state", "district", "status",
                "head_name", "address_line", "normalized_address", "pin_code", "website",
                "detail_url", "school_id", "source_record_id", "detail_source_record_id",
                "raw_row", "detail_fields", "parser_version", "identity_match_method",
                "identity_confidence", "requires_manual_review",
            ):
                setattr(existing, field, getattr(record, field))
            self.session.flush()
            return existing
        self.session.add(record)
        self.session.flush()
        return record

    def count_all(self) -> int:
        from sqlalchemy import func

        return int(self.session.scalar(select(func.count()).select_from(SarasSchoolRecord)) or 0)


class MatchCandidateRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        *,
        source: str,
        source_payload: dict,
        candidate_school_id: UUID,
        matching_method: str,
        confidence_score: float,
        matched_fields: dict | None,
        mismatch_fields: dict | None,
        requires_manual_review: bool,
        source_record_id: UUID | None = None,
        saras_record_id: UUID | None = None,
    ) -> MatchCandidate:
        existing = self.session.scalar(
            select(MatchCandidate).where(
                MatchCandidate.source == source,
                MatchCandidate.candidate_school_id == candidate_school_id,
                MatchCandidate.matching_method == matching_method,
                MatchCandidate.saras_record_id == saras_record_id,
                MatchCandidate.decision_status == MatchDecisionStatus.PENDING.value,
            )
        )
        if existing:
            existing.confidence_score = confidence_score
            existing.matched_fields = matched_fields
            existing.mismatch_fields = mismatch_fields
            existing.requires_manual_review = requires_manual_review
            existing.source_payload = source_payload
            self.session.flush()
            return existing

        row = MatchCandidate(
            source=source,
            source_record_id=source_record_id,
            saras_record_id=saras_record_id,
            source_payload=source_payload,
            candidate_school_id=candidate_school_id,
            matching_method=matching_method,
            confidence_score=confidence_score,
            matched_fields=matched_fields,
            mismatch_fields=mismatch_fields,
            requires_manual_review=requires_manual_review,
            decision_status=MatchDecisionStatus.PENDING.value,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def list_pending(self, limit: int = 50) -> list[MatchCandidate]:
        stmt = (
            select(MatchCandidate)
            .where(MatchCandidate.decision_status == MatchDecisionStatus.PENDING.value)
            .order_by(MatchCandidate.created_at.desc())
            .limit(limit)
        )
        return list(self.session.scalars(stmt).all())

    def count_pending(self) -> int:
        from sqlalchemy import func

        return int(
            self.session.scalar(
                select(func.count()).select_from(MatchCandidate).where(
                    MatchCandidate.decision_status == MatchDecisionStatus.PENDING.value
                )
            )
            or 0
        )
