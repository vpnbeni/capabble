from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from school_intel.config import get_settings
from school_intel.domain.enums import (
    DataSource,
    IdentityMatchConfidence,
    IdentifierType,
    MatchDecisionStatus,
    MatchingMethod,
)
from school_intel.domain.schemas import (
    IdentityMatchCandidate,
    IdentityResolutionResult,
    SchoolIdentifierInput,
)
from school_intel.repositories.saras_repository import MatchCandidateRepository
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.utils.text import normalize_address, normalize_identifier, normalize_school_name


@dataclass
class IdentityLookupInput:
    canonical_name: str | None = None
    district: str | None = None
    state: str | None = None
    pin_code: str | None = None
    address_line: str | None = None
    identifiers: list[SchoolIdentifierInput] | None = None
    source: DataSource = DataSource.MANUAL
    source_payload: dict | None = None
    source_record_id: UUID | None = None
    saras_record_id: UUID | None = None


@dataclass
class RankedMatch:
    school_id: UUID
    canonical_name: str
    method: MatchingMethod
    score: float
    confidence: IdentityMatchConfidence
    matched_fields: dict = field(default_factory=dict)
    mismatch_fields: dict = field(default_factory=dict)
    auto_merge_allowed: bool = False


class SchoolIdentityService:
    """
    Resolve or create canonical school identity with prioritized matching.

    Levels 1-4 are deterministic. Levels 5-6 are advisory; low-confidence
    matches are stored in match_candidates and never auto-merged.
    """

    DETERMINISTIC_TYPES = (
        IdentifierType.UDISE,
        IdentifierType.CBSE_AFFILIATION,
        IdentifierType.STATE_SCHOOL_CODE,
        IdentifierType.KYS_SCHOOL_ID,
    )

    METHOD_PRIORITY = {
        MatchingMethod.EXACT_UDISE: 1,
        MatchingMethod.EXACT_CBSE_AFFILIATION: 2,
        MatchingMethod.EXACT_STATE_SCHOOL_CODE: 3,
        MatchingMethod.DETERMINISTIC_COMBO: 4,
        MatchingMethod.NAME_DISTRICT_PIN: 5,
        MatchingMethod.FUZZY_NAME_ADDRESS: 6,
    }

    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = SchoolRepository(session)
        self.match_repo = MatchCandidateRepository(session)
        self.settings = get_settings()

    def resolve(self, payload: IdentityLookupInput, create_if_missing: bool = True) -> IdentityResolutionResult:
        ranked = self._rank_matches(payload)
        if ranked:
            best = ranked[0]
            if best.auto_merge_allowed:
                self._attach_identifiers(best.school_id, payload.identifiers or [])
                return IdentityResolutionResult(
                    school_id=best.school_id,
                    created=False,
                    candidates=[self._to_candidate(best)],
                    requires_manual_review=False,
                )

            for match in ranked:
                self._store_match_candidate(payload, match)

            return IdentityResolutionResult(
                school_id=None,
                created=False,
                candidates=[self._to_candidate(m) for m in ranked],
                requires_manual_review=True,
            )

        if not create_if_missing:
            return IdentityResolutionResult(school_id=None, created=False, candidates=[], requires_manual_review=False)

        if not payload.canonical_name:
            raise ValueError("canonical_name is required to create a new school identity")

        school = self.repo.create_school(
            canonical_name=payload.canonical_name.strip(),
            district=payload.district,
            state=payload.state,
            pin_code=payload.pin_code,
            address_line=payload.address_line,
        )
        self._attach_identifiers(school.id, payload.identifiers or [])
        return IdentityResolutionResult(
            school_id=school.id,
            created=True,
            candidates=[],
            requires_manual_review=False,
        )

    def match_by_udise(self, udise: str) -> IdentityResolutionResult:
        return self.resolve(
            IdentityLookupInput(
                identifiers=[
                    SchoolIdentifierInput(
                        identifier_type=IdentifierType.UDISE,
                        identifier_value=udise,
                        source=DataSource.MANUAL,
                        is_verified=True,
                    )
                ]
            ),
            create_if_missing=False,
        )

    def _rank_matches(self, payload: IdentityLookupInput) -> list[RankedMatch]:
        matches: list[RankedMatch] = []
        seen_schools: set[UUID] = set()

        for identifier in payload.identifiers or []:
            if identifier.identifier_type == IdentifierType.UDISE:
                method = MatchingMethod.EXACT_UDISE
            elif identifier.identifier_type == IdentifierType.CBSE_AFFILIATION:
                method = MatchingMethod.EXACT_CBSE_AFFILIATION
            elif identifier.identifier_type == IdentifierType.STATE_SCHOOL_CODE:
                method = MatchingMethod.EXACT_STATE_SCHOOL_CODE
            else:
                method = MatchingMethod.DETERMINISTIC_COMBO

            if identifier.identifier_type not in self.DETERMINISTIC_TYPES:
                continue

            existing = self.repo.find_identifier(
                identifier.identifier_type.value, identifier.identifier_value
            )
            if existing and existing.school_id not in seen_schools:
                school = self.repo.get_by_id(existing.school_id)
                matches.append(
                    RankedMatch(
                        school_id=existing.school_id,
                        canonical_name=school.canonical_name if school else "",
                        method=method,
                        score=100.0,
                        confidence=IdentityMatchConfidence.EXACT,
                        matched_fields={identifier.identifier_type.value: identifier.identifier_value},
                        auto_merge_allowed=True,
                    )
                )
                seen_schools.add(existing.school_id)

        if payload.canonical_name and payload.district:
            combo_rows = self.repo.find_by_normalized_name_district_pin(
                payload.canonical_name, payload.district, payload.pin_code
            )
            target_name = normalize_school_name(payload.canonical_name)
            target_district = (payload.district or "").strip().upper()
            for row in combo_rows:
                if row.id in seen_schools:
                    continue
                district_match = (row.district or "").strip().upper() == target_district
                pin_match = (
                    not payload.pin_code
                    or not row.pin_code
                    or normalize_identifier(row.pin_code) == normalize_identifier(payload.pin_code)
                )
                if district_match and pin_match:
                    matches.append(
                        RankedMatch(
                            school_id=row.id,
                            canonical_name=row.canonical_name,
                            method=MatchingMethod.NAME_DISTRICT_PIN,
                            score=95.0,
                            confidence=IdentityMatchConfidence.HIGH,
                            matched_fields={
                                "normalized_name": target_name,
                                "district": payload.district,
                                "pin_code": payload.pin_code,
                            },
                            auto_merge_allowed=True,
                        )
                    )
                    seen_schools.add(row.id)

        if payload.canonical_name:
            fuzzy_rows = self.repo.find_by_normalized_name_district_pin(
                payload.canonical_name, payload.district, None
            )
            target_name = normalize_school_name(payload.canonical_name)
            target_addr = normalize_address(payload.address_line or "")
            for row in fuzzy_rows:
                if row.id in seen_schools:
                    continue
                name_score = float(fuzz.token_sort_ratio(target_name, row.normalized_name))
                if name_score < self.settings.identity_fuzzy_threshold:
                    continue
                if payload.district and row.district:
                    if (row.district or "").strip().upper() != payload.district.strip().upper():
                        continue
                addr_score = 0.0
                if target_addr and row.address_line:
                    addr_score = float(
                        fuzz.token_sort_ratio(target_addr, normalize_address(row.address_line))
                    )
                score = (name_score * 0.7) + (addr_score * 0.3) if target_addr else name_score
                auto_merge = score >= self.settings.identity_auto_merge_threshold
                if not auto_merge and name_score < self.settings.identity_auto_merge_threshold:
                    confidence = IdentityMatchConfidence.LOW
                elif score >= self.settings.identity_auto_merge_threshold:
                    confidence = IdentityMatchConfidence.HIGH
                else:
                    confidence = IdentityMatchConfidence.MEDIUM

                matches.append(
                    RankedMatch(
                        school_id=row.id,
                        canonical_name=row.canonical_name,
                        method=MatchingMethod.FUZZY_NAME_ADDRESS,
                        score=score,
                        confidence=confidence,
                        matched_fields={"name_score": name_score, "address_score": addr_score},
                        mismatch_fields={},
                        auto_merge_allowed=auto_merge,
                    )
                )
                seen_schools.add(row.id)

        matches.sort(
            key=lambda m: (self.METHOD_PRIORITY.get(m.method, 99), -m.score)
        )
        return matches

    def _store_match_candidate(self, payload: IdentityLookupInput, match: RankedMatch) -> None:
        self.match_repo.create(
            source=payload.source.value,
            source_payload=payload.source_payload or {},
            candidate_school_id=match.school_id,
            matching_method=match.method.value,
            confidence_score=match.score,
            matched_fields=match.matched_fields,
            mismatch_fields=match.mismatch_fields,
            requires_manual_review=not match.auto_merge_allowed,
            source_record_id=payload.source_record_id,
            saras_record_id=payload.saras_record_id,
        )

    def _to_candidate(self, match: RankedMatch) -> IdentityMatchCandidate:
        return IdentityMatchCandidate(
            school_id=match.school_id,
            canonical_name=match.canonical_name,
            confidence=match.confidence,
            score=match.score,
            matched_on=[match.method.value],
            auto_merge_allowed=match.auto_merge_allowed,
        )

    def attach_identifiers(self, school_id: UUID, identifiers: list[SchoolIdentifierInput]) -> None:
        self._attach_identifiers(school_id, identifiers)

    def _attach_identifiers(self, school_id: UUID, identifiers: list[SchoolIdentifierInput]) -> None:
        for identifier in identifiers:
            self.repo.upsert_identifier(
                school_id=school_id,
                identifier_type=identifier.identifier_type.value,
                identifier_value=identifier.identifier_value,
                source=identifier.source.value,
                is_verified=identifier.is_verified,
            )

    def accept_match(self, candidate_id: UUID) -> UUID:
        from school_intel.db.models import MatchCandidate

        row = self.session.get(MatchCandidate, candidate_id)
        if not row:
            raise ValueError(f"Match candidate not found: {candidate_id}")
        row.decision_status = MatchDecisionStatus.ACCEPTED.value
        self.session.flush()
        return row.candidate_school_id
