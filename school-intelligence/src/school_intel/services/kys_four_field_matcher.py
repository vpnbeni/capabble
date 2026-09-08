"""Four-field SARAS ↔ KYS cross-source matching engine.

Primary automatic mapping strategy (before manual KYS-ID entry):
  STATE + DISTRICT + SCHOOL NAME + SCHOOL ADDRESS

Requires an injectable KYS candidate dataset (search API or bulk list).
The public KYS UI is CAPTCHA-protected; when no candidates are available the
resolver returns PENDING and manual verification remains the fallback.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from rapidfuzz import fuzz

from school_intel.domain.enums import IdentityMatchConfidence, KysMappingMethod
from school_intel.domain.kys_mapping import KysMappingCandidateResult, KysSearchCandidate
from school_intel.utils.text import (
    extract_pin_from_text,
    normalize_address_for_matching,
    normalize_district_for_matching,
    normalize_identifier,
    normalize_school_name_for_matching,
    normalize_state_for_matching,
)

# Scoring thresholds (post-normalization).
NAME_HIGH = 88.0
NAME_MEDIUM = 75.0
NAME_WEAK = 60.0
ADDRESS_HIGH = 72.0
ADDRESS_MEDIUM = 50.0
ADDRESS_WEAK = 35.0


@dataclass(frozen=True)
class SarasMappingFields:
    """SARAS-side cross-source matching keys (not canonical identity)."""

    state: str | None
    district: str | None
    school_name: str | None
    address_line: str | None
    pin_code: str | None = None

    @classmethod
    def from_school(cls, school: Any) -> SarasMappingFields:
        return cls(
            state=getattr(school, "state", None),
            district=getattr(school, "district", None),
            school_name=getattr(school, "canonical_name", None),
            address_line=getattr(school, "address_line", None),
            pin_code=getattr(school, "pin_code", None),
        )

    @classmethod
    def from_saras_row(cls, row: dict[str, Any]) -> SarasMappingFields:
        return cls(
            state=row.get("state"),
            district=row.get("district"),
            school_name=row.get("school_name"),
            address_line=row.get("address_line"),
            pin_code=row.get("pin_code"),
        )


@dataclass
class FourFieldScore:
    accepted: bool
    rejected: bool
    rejection_reason: str | None = None
    name_score: float = 0.0
    address_score: float = 0.0
    confidence: IdentityMatchConfidence = IdentityMatchConfidence.LOW
    composite_score: float = 0.0
    matched_fields: dict[str, Any] = field(default_factory=dict)
    mismatch_fields: dict[str, Any] = field(default_factory=dict)
    normalized: dict[str, Any] = field(default_factory=dict)


class KysFourFieldMatcher:
    """Score KYS candidates against a SARAS record using four common fields."""

    def score_pair(self, saras: SarasMappingFields, candidate: KysSearchCandidate) -> FourFieldScore:
        s_state = normalize_state_for_matching(saras.state)
        s_district = normalize_district_for_matching(saras.district)
        s_name = normalize_school_name_for_matching(saras.school_name or "")
        s_addr = normalize_address_for_matching(saras.address_line or "")
        s_pin = normalize_identifier(saras.pin_code or "") or extract_pin_from_text(saras.address_line or "") or ""

        k_state = normalize_state_for_matching(candidate.state)
        k_district = normalize_district_for_matching(candidate.district)
        k_name = normalize_school_name_for_matching(candidate.school_name or "")
        k_addr = normalize_address_for_matching(candidate.address_line or "")
        k_pin = normalize_identifier(candidate.pin_code or "") or extract_pin_from_text(candidate.address_line or "") or ""

        normalized = {
            "saras": {"state": s_state, "district": s_district, "name": s_name, "address": s_addr, "pin": s_pin},
            "kys": {"state": k_state, "district": k_district, "name": k_name, "address": k_addr, "pin": k_pin},
        }

        # Hard rejects: state / district mismatch when both sides present.
        if s_state and k_state and s_state != k_state:
            return FourFieldScore(
                accepted=False,
                rejected=True,
                rejection_reason="state_mismatch",
                normalized=normalized,
                mismatch_fields={"state": {"saras": saras.state, "kys": candidate.state}},
            )
        if s_district and k_district and s_district != k_district:
            return FourFieldScore(
                accepted=False,
                rejected=True,
                rejection_reason="district_mismatch",
                normalized=normalized,
                mismatch_fields={"district": {"saras": saras.district, "kys": candidate.district}},
            )

        name_score = float(fuzz.token_sort_ratio(s_name, k_name)) if s_name and k_name else 0.0
        address_score = float(fuzz.token_set_ratio(s_addr, k_addr)) if s_addr and k_addr else 0.0

        matched: dict[str, Any] = {}
        mismatched: dict[str, Any] = {}

        if s_state and k_state and s_state == k_state:
            matched["state"] = saras.state
        if s_district and k_district and s_district == k_district:
            matched["district"] = saras.district
        if name_score >= NAME_MEDIUM:
            matched["name"] = round(name_score, 2)
        elif s_name and k_name:
            mismatched["name"] = round(name_score, 2)
        if address_score >= ADDRESS_MEDIUM:
            matched["address"] = round(address_score, 2)
        elif s_addr and k_addr:
            mismatched["address"] = round(address_score, 2)
        if s_pin and k_pin:
            if s_pin == k_pin:
                matched["pin_code"] = s_pin
            else:
                mismatched["pin_code"] = {"saras": s_pin, "kys": k_pin}

        confidence = self._classify_confidence(name_score, address_score, matched, mismatched)
        composite = self._composite_score(name_score, address_score, matched)

        return FourFieldScore(
            accepted=True,
            rejected=False,
            name_score=name_score,
            address_score=address_score,
            confidence=confidence,
            composite_score=composite,
            matched_fields=matched,
            mismatch_fields=mismatched,
            normalized=normalized,
        )

    def match_candidates(
        self,
        saras: SarasMappingFields,
        candidates: list[KysSearchCandidate],
    ) -> list[KysMappingCandidateResult]:
        """Return accepted, scored KYS candidates sorted by composite score."""
        results: list[KysMappingCandidateResult] = []
        for candidate in candidates:
            score = self.score_pair(saras, candidate)
            if score.rejected or not score.accepted:
                continue
            if score.confidence == IdentityMatchConfidence.LOW:
                continue
            results.append(
                KysMappingCandidateResult(
                    kys_school_id=candidate.kys_school_id,
                    udise=candidate.udise,
                    school_name=candidate.school_name,
                    district=candidate.district,
                    pin_code=candidate.pin_code,
                    address_line=candidate.address_line,
                    confidence=score.confidence,
                    score=score.composite_score,
                    method=KysMappingMethod.FOUR_FIELD_MATCH,
                    matched_fields={
                        **score.matched_fields,
                        "name_score": score.name_score,
                        "address_score": score.address_score,
                        "normalized": score.normalized,
                    },
                    mismatch_fields=score.mismatch_fields,
                )
            )
        results.sort(key=lambda row: row.score, reverse=True)
        return results

    @staticmethod
    def _classify_confidence(
        name_score: float,
        address_score: float,
        matched: dict[str, Any],
        mismatched: dict[str, Any],
    ) -> IdentityMatchConfidence:
        if name_score < NAME_WEAK:
            return IdentityMatchConfidence.LOW

        district_ok = "district" in matched
        has_strong_name = name_score >= NAME_HIGH
        has_strong_address = address_score >= ADDRESS_HIGH
        has_medium_address = address_score >= ADDRESS_MEDIUM

        if has_strong_name and has_strong_address and district_ok:
            return IdentityMatchConfidence.HIGH

        if has_strong_name and district_ok and not has_strong_address:
            # Name strong, address ambiguous or weaker
            return IdentityMatchConfidence.MEDIUM

        if name_score >= NAME_MEDIUM and district_ok:
            return IdentityMatchConfidence.MEDIUM

        return IdentityMatchConfidence.LOW

    @staticmethod
    def _composite_score(name_score: float, address_score: float, matched: dict[str, Any]) -> float:
        weights = [name_score * 0.5]
        if "district" in matched:
            weights.append(20.0)
        if "state" in matched:
            weights.append(10.0)
        if "address" in matched:
            weights.append(address_score * 0.25)
        if "pin_code" in matched:
            weights.append(10.0)
        return sum(weights)


def classify_resolver_outcome(
    scored: list[KysMappingCandidateResult],
) -> tuple[str, str]:
    """Map scored candidates to resolver status hint and reason."""
    if not scored:
        return "PENDING", "No KYS candidate passed four-field matching"
    high = [c for c in scored if c.confidence == IdentityMatchConfidence.HIGH]
    if len(high) == 1:
        return "MAPPED_CANDIDATE", "Single high-confidence four-field KYS match"
    if len(high) >= 2 or len(scored) >= 2:
        return "REVIEW", "Multiple plausible KYS schools after four-field matching"
    if len(scored) == 1 and scored[0].confidence == IdentityMatchConfidence.MEDIUM:
        return "REVIEW", "Name strong but address ambiguous; manual review required"
    return "PENDING", "No high-confidence four-field KYS match"
