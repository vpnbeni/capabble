"""Match a manually-pasted KYS bulk listing against pending SCHOL schools.

The source data is a raw JSON response a human copies out of the browser's
DevTools Network tab after solving KYS's CAPTCHA themselves (e.g. an Advance
Search result for a whole district). This service never trusts that pasted
data blindly: each high-confidence candidate is still independently verified
via a live, non-CAPTCHA schoolId-based fetch (the same path the single-school
"Resolve KYS" panel uses) before anything is persisted.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from school_intel.db.models import CollectionRunSchool, School
from school_intel.domain.enums import IdentifierType, IdentityMatchConfidence
from school_intel.domain.kys_mapping import KysSearchCandidate
from school_intel.services.kys_four_field_matcher import KysFourFieldMatcher, SarasMappingFields
from school_intel.services.kys_mapping_resolver import KysMappingResolver

logger = logging.getLogger("school_intel.kys_bulk_import")


def extract_kys_listing_rows(raw: Any) -> list[dict]:
    """Best-effort extraction of a flat school-record list from a pasted KYS
    API response. Handles the shapes seen across KYS endpoints: a bare list,
    {"data": [...]}, or {"data": {"content": [...]}}."""
    if isinstance(raw, list):
        return [row for row in raw if isinstance(row, dict)]
    if isinstance(raw, dict):
        data = raw.get("data", raw)
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        if isinstance(data, dict):
            content = data.get("content")
            if isinstance(content, list):
                return [row for row in content if isinstance(row, dict)]
    return []


# Back-compat alias for older call sites / tests.
_extract_rows = extract_kys_listing_rows


def row_to_kys_candidate(row: dict) -> KysSearchCandidate | None:
    school_id = row.get("schoolId")
    if school_id is None:
        return None
    return KysSearchCandidate(
        kys_school_id=str(school_id).strip(),
        udise=str(row.get("udiseschCode") or "").strip() or None,
        school_name=str(row.get("schoolName") or "").strip() or None,
        district=str(row.get("districtName") or "").strip() or None,
        state=str(row.get("stateName") or "").strip() or None,
        pin_code=str(row.get("pincode") or "").strip() or None,
        address_line=str(row.get("address") or "").strip() or None,
        raw=row,
    )


# Back-compat alias for older call sites / tests.
_row_to_candidate = row_to_kys_candidate


class KysBulkImportService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.matcher = KysFourFieldMatcher()

    def import_dump(
        self,
        raw_payload: Any,
        *,
        district: str | None = None,
        auto_confirm: bool = True,
        collection_run_id: UUID | None = None,
        school_ids: list[UUID] | None = None,
    ) -> dict:
        rows = extract_kys_listing_rows(raw_payload)
        candidates = [c for c in (row_to_kys_candidate(r) for r in rows) if c is not None]
        if not candidates:
            return {
                "error": "No school records found in the pasted data.",
                "rows_seen": len(rows),
                "candidates_parsed": 0,
            }

        # An explicit school_ids/collection_run_id scope (e.g. a single
        # collection run's resolved schools) takes precedence over inferring
        # a district from the pasted rows — the caller already knows exactly
        # which schools it wants matched.
        inferred_district = None if (school_ids or collection_run_id) else (district or self._infer_district(candidates))
        pending_schools = self._pending_schools(
            inferred_district,
            collection_run_id=collection_run_id,
            school_ids=school_ids,
        )

        auto_mapped: list[dict] = []
        needs_review: list[dict] = []
        no_match: list[dict] = []

        resolver = KysMappingResolver(self.session) if auto_confirm else None
        try:
            for school in pending_schools:
                saras = SarasMappingFields.from_school(school)
                scored = self.matcher.match_candidates(saras, candidates)
                if not scored:
                    no_match.append({"school_id": str(school.id), "school_name": school.canonical_name})
                    continue

                top = scored[0]
                entry: dict[str, Any] = {
                    "school_id": str(school.id),
                    "school_name": school.canonical_name,
                    "school_district": school.district,
                    "school_pin_code": school.pin_code,
                    "school_address": school.address_line,
                    "kys_school_id": top.kys_school_id,
                    "kys_school_name": top.school_name,
                    "kys_district": top.district,
                    "kys_pin_code": top.pin_code,
                    "kys_address": top.address_line,
                    "confidence": top.confidence.value,
                    "score": top.score,
                    "matched_fields": top.matched_fields,
                    "mismatch_fields": top.mismatch_fields,
                }

                if top.confidence == IdentityMatchConfidence.HIGH and auto_confirm and resolver is not None:
                    result = resolver.confirm_manual_mapping(school.id, top.kys_school_id)
                    persisted = result.status.value == "MAPPED" and result.persisted
                    entry["persisted"] = persisted
                    entry["reason"] = result.reason
                    (auto_mapped if persisted else needs_review).append(entry)
                else:
                    needs_review.append(entry)

            if auto_confirm:
                self.session.commit()
        finally:
            if resolver is not None:
                resolver.close()

        return {
            "candidates_parsed": len(candidates),
            "district_used": inferred_district,
            "schools_checked": len(pending_schools),
            "auto_mapped": auto_mapped,
            "needs_review": needs_review,
            "no_match": no_match,
        }

    def _infer_district(self, candidates: list[KysSearchCandidate]) -> str | None:
        counts: dict[str, int] = {}
        for c in candidates:
            if c.district:
                counts[c.district] = counts.get(c.district, 0) + 1
        if not counts:
            return None
        return max(counts, key=counts.get)

    def _pending_schools(
        self,
        district: str | None,
        *,
        collection_run_id: UUID | None = None,
        school_ids: list[UUID] | None = None,
    ) -> list[School]:
        stmt = select(School).where(School.is_active.is_(True))
        if school_ids:
            stmt = stmt.where(School.id.in_(school_ids))
        elif collection_run_id:
            run_school_ids = select(CollectionRunSchool.school_id).where(
                CollectionRunSchool.collection_run_id == collection_run_id,
                CollectionRunSchool.school_id.isnot(None),
            )
            stmt = stmt.where(School.id.in_(run_school_ids))
        elif district:
            stmt = stmt.where(School.district.ilike(district))
        schools = list(self.session.scalars(stmt).all())
        pending = []
        for school in schools:
            has_verified_kys = any(
                i.identifier_type == IdentifierType.KYS_SCHOOL_ID.value and i.is_verified
                for i in school.identifiers
            )
            if not has_verified_kys:
                pending.append(school)
        return pending
