from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from school_intel.collectors.kys_collector import KysCollector
from school_intel.collectors.kys_search_client import KysSearchClient, is_valid_kys_school_id
from school_intel.db.models import CollectionRunSchool, School
from school_intel.domain.collection_contract import normalize_school_status
from school_intel.domain.enums import (
    BatchSchoolCollectionStatus,
    DataSource,
    IdentityMatchConfidence,
    IdentifierType,
    KysMappingMethod,
    KysMappingStatus,
)
from school_intel.domain.kys_mapping import (
    KysMappingCandidateResult,
    KysMappingProvenance,
    KysMappingResult,
    KysSearchCandidate,
    KysVerificationResult,
)
from school_intel.domain.schemas import SchoolIdentifierInput
from school_intel.parsers.kys_parser import KysParser
from school_intel.repositories.batch_collection_repository import BatchCollectionRepository
from school_intel.repositories.kys_mapping_repository import KysMappingRepository
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.kys_four_field_matcher import (
    KysFourFieldMatcher,
    SarasMappingFields,
    classify_resolver_outcome,
)
from school_intel.services.school_identity_service import SchoolIdentityService
from school_intel.utils.text import normalize_identifier

logger = logging.getLogger("school_intel.kys_mapping")


class KysMappingResolver:
    """Resolve canonical SCHOL schools to verified KYS_SCHOOL_ID mappings."""

    def __init__(
        self,
        session,
        *,
        collector: KysCollector | None = None,
        search_client: KysSearchClient | None = None,
    ) -> None:
        self.session = session
        self.repo = SchoolRepository(session)
        self.mapping_repo = KysMappingRepository(session)
        self.batch_repo = BatchCollectionRepository(session)
        self.identity = SchoolIdentityService(session)
        self.parser = KysParser()
        self.collector = collector or KysCollector()
        self.search_client = search_client or KysSearchClient()
        self.four_field_matcher = KysFourFieldMatcher()
        self._owns_collector = collector is None
        self._owns_search = search_client is None

    def close(self) -> None:
        if self._owns_collector:
            self.collector.close()
        if self._owns_search:
            self.search_client.close()

    def resolve(self, school_id: UUID, *, persist: bool = False) -> KysMappingResult:
        school = self.repo.get_by_id(school_id)
        if not school:
            raise ValueError(f"School not found: {school_id}")

        identifiers = {i.identifier_type: i for i in school.identifiers}
        kys_ident = identifiers.get(IdentifierType.KYS_SCHOOL_ID.value)
        udise_ident = identifiers.get(IdentifierType.UDISE.value)

        if kys_ident and kys_ident.is_verified:
            return KysMappingResult(
                school_id=school_id,
                status=KysMappingStatus.MAPPED,
                kys_school_id=kys_ident.identifier_value,
                udise=udise_ident.identifier_value if udise_ident else None,
                confidence=IdentityMatchConfidence.HIGH,
                method=KysMappingMethod.EXISTING_IDENTIFIER,
                candidate_count=0,
                reason="Verified KYS_SCHOOL_ID already present",
                provenance=KysMappingProvenance(
                    source=DataSource.KYS.value,
                    method=KysMappingMethod.EXISTING_IDENTIFIER,
                    verified_at=kys_ident.verified_at.isoformat() if kys_ident.verified_at else None,
                ),
            )

        if kys_ident and not kys_ident.is_verified:
            verification = self.verify_kys_id(school_id, kys_ident.identifier_value)
            if verification.verdict == "verified" and persist:
                return self._persist_verified_mapping(
                    school,
                    kys_ident.identifier_value,
                    verification.kys_identity.get("udise"),
                    KysMappingMethod.EXISTING_IDENTIFIER,
                    verification,
                )
            if verification.verdict == "verified":
                return KysMappingResult(
                    school_id=school_id,
                    status=KysMappingStatus.MAPPED,
                    kys_school_id=kys_ident.identifier_value,
                    udise=verification.kys_identity.get("udise"),
                    confidence=verification.confidence,
                    method=KysMappingMethod.EXISTING_IDENTIFIER,
                    candidate_count=0,
                    reason="Unverified KYS ID matches school identity",
                )
            if verification.verdict == "review":
                return self._review_result(school_id, verification, candidate_count=1)

        availability = self.search_client.availability()
        saras = self._saras_fields(school)
        raw_candidates = self._search_candidates(school, udise_ident.identifier_value if udise_ident else None)
        scored = self.four_field_matcher.match_candidates(saras, raw_candidates)

        for candidate in scored:
            self.mapping_repo.upsert_candidate(
                school_id=school_id,
                kys_school_id=candidate.kys_school_id,
                udise=candidate.udise,
                matching_method=candidate.method.value,
                confidence_score=candidate.score,
                confidence_label=candidate.confidence.value,
                candidate_payload={
                    "school_name": candidate.school_name,
                    "district": candidate.district,
                    "pin_code": candidate.pin_code,
                    "address_line": candidate.address_line,
                    "matched_fields": candidate.matched_fields,
                },
                matched_fields=candidate.matched_fields,
                mismatch_fields=candidate.mismatch_fields,
                provenance={
                    "source": DataSource.KYS.value,
                    "strategy": "four_field_match",
                    "kys_data_access": availability.programmatic_search_available,
                    "kys_data_reason": availability.reason,
                },
            )

        outcome_hint, outcome_reason = classify_resolver_outcome(scored)
        high = [c for c in scored if c.confidence == IdentityMatchConfidence.HIGH]

        if outcome_hint == "MAPPED_CANDIDATE" and len(high) == 1:
            top = high[0]
            if persist and top.kys_school_id:
                verification = self.verify_kys_id(school_id, top.kys_school_id)
                if verification.verdict == "verified":
                    return self._persist_verified_mapping(
                        school,
                        top.kys_school_id,
                        verification.kys_identity.get("udise") or top.udise,
                        KysMappingMethod.FOUR_FIELD_MATCH,
                        verification,
                    )
                if verification.verdict == "review":
                    return self._review_result(school_id, verification, candidate_count=1)
            return KysMappingResult(
                school_id=school_id,
                status=KysMappingStatus.MAPPED,
                kys_school_id=top.kys_school_id,
                udise=top.udise,
                confidence=top.confidence,
                method=KysMappingMethod.FOUR_FIELD_MATCH,
                candidate_count=1,
                candidates=scored,
                reason=outcome_reason,
            )

        if outcome_hint == "REVIEW":
            return KysMappingResult(
                school_id=school_id,
                status=KysMappingStatus.REVIEW,
                candidate_count=len(scored),
                candidates=scored,
                reason=outcome_reason,
            )

        if not raw_candidates:
            return KysMappingResult(
                school_id=school_id,
                status=KysMappingStatus.PENDING,
                candidate_count=0,
                reason=(
                    "No KYS candidate dataset available; four-field automatic matching requires "
                    f"programmatic KYS search or injected candidates. {availability.reason}"
                ),
            )

        return KysMappingResult(
            school_id=school_id,
            status=KysMappingStatus.PENDING,
            candidate_count=len(scored),
            candidates=scored,
            reason=outcome_reason or "No high-confidence four-field KYS match",
        )

    def verify_kys_id(self, school_id: UUID, kys_school_id: str) -> KysVerificationResult:
        school = self.repo.get_by_id(school_id)
        if not school:
            raise ValueError(f"School not found: {school_id}")

        normalized = kys_school_id.strip()
        if not is_valid_kys_school_id(normalized):
            return KysVerificationResult(
                valid=False,
                kys_school_id=normalized,
                verdict="invalid",
                reason="KYS school ID must be a positive integer",
            )

        try:
            latest, _years, report, profile = self.collector.fetch_identity_reference(normalized)
        except ValueError as exc:
            return KysVerificationResult(
                valid=False,
                kys_school_id=normalized,
                verdict="rejected",
                reason=str(exc),
            )

        identity = self.parser.parse_school_identity(
            report.raw_payload,
            profile.raw_payload,
            kys_school_id=normalized,
            academic_year=latest.academic_year,
            year_id=latest.year_id,
        )
        saras = self._saras_fields(school)
        kys_candidate = KysSearchCandidate(
            kys_school_id=normalized,
            udise=identity.udise,
            school_name=identity.canonical_name,
            district=identity.district,
            state=identity.state,
            pin_code=identity.pin_code,
            address_line=identity.address_line,
        )
        field_score = self.four_field_matcher.score_pair(saras, kys_candidate)

        if field_score.rejected:
            return KysVerificationResult(
                valid=False,
                kys_school_id=normalized,
                verdict="rejected",
                confidence=IdentityMatchConfidence.LOW,
                score=0.0,
                kys_identity={
                    "canonical_name": identity.canonical_name,
                    "district": identity.district,
                    "state": identity.state,
                    "pin_code": identity.pin_code,
                    "address_line": identity.address_line,
                    "udise": identity.udise,
                },
                matched_fields=field_score.matched_fields,
                mismatch_fields=field_score.mismatch_fields,
                reason=f"Four-field rejection: {field_score.rejection_reason}",
            )

        if field_score.confidence == IdentityMatchConfidence.HIGH:
            verdict = "verified"
            reason = "Four-field KYS identity matches SARAS school"
        elif field_score.confidence == IdentityMatchConfidence.MEDIUM:
            verdict = "review"
            reason = "Four-field partial match; manual review required"
        else:
            verdict = "rejected"
            reason = "Four-field KYS identity does not match SARAS school"

        return KysVerificationResult(
            valid=verdict != "invalid",
            kys_school_id=normalized,
            verdict=verdict,
            confidence=field_score.confidence,
            score=field_score.composite_score,
            kys_identity={
                "canonical_name": identity.canonical_name,
                "district": identity.district,
                "state": identity.state,
                "pin_code": identity.pin_code,
                "address_line": identity.address_line,
                "udise": identity.udise,
                "academic_year": identity.academic_year,
            },
            matched_fields={
                **field_score.matched_fields,
                "name_score": field_score.name_score,
                "address_score": field_score.address_score,
                "normalized": field_score.normalized,
            },
            mismatch_fields=field_score.mismatch_fields,
            reason=reason,
        )

    def confirm_manual_mapping(
        self,
        school_id: UUID,
        kys_school_id: str,
        *,
        method: KysMappingMethod = KysMappingMethod.OPERATOR_CONFIRMED,
        udise_override: str | None = None,
    ) -> KysMappingResult:
        verification = self.verify_kys_id(school_id, kys_school_id)
        if verification.verdict != "verified":
            status = (
                KysMappingStatus.REVIEW
                if verification.verdict == "review"
                else KysMappingStatus.PENDING
            )
            return KysMappingResult(
                school_id=school_id,
                status=status,
                kys_school_id=kys_school_id if verification.valid else None,
                candidate_count=1,
                reason=verification.reason,
            )

        school = self.repo.get_by_id(school_id)
        if not school:
            raise ValueError(f"School not found: {school_id}")

        udise = udise_override or verification.kys_identity.get("udise")
        return self._persist_verified_mapping(school, kys_school_id.strip(), udise, method, verification)

    def _persist_verified_mapping(
        self,
        school: School,
        kys_school_id: str,
        udise: str | None,
        method: KysMappingMethod,
        verification: KysVerificationResult,
    ) -> KysMappingResult:
        existing = self.repo.get_school_identifier(school.id, IdentifierType.KYS_SCHOOL_ID.value)
        if existing and existing.is_verified and existing.identifier_value != kys_school_id:
            return KysMappingResult(
                school_id=school.id,
                status=KysMappingStatus.MAPPED,
                kys_school_id=existing.identifier_value,
                udise=self._school_udise(school),
                confidence=IdentityMatchConfidence.HIGH,
                method=KysMappingMethod.EXISTING_IDENTIFIER,
                candidate_count=0,
                reason="Verified mapping preserved; cannot overwrite with weaker evidence",
                persisted=False,
            )

        self.repo.ensure_verified_identifier(
            school.id,
            IdentifierType.KYS_SCHOOL_ID.value,
            kys_school_id,
            DataSource.KYS.value,
        )
        if udise:
            self.repo.ensure_verified_identifier(
                school.id,
                IdentifierType.UDISE.value,
                udise,
                DataSource.KYS.value,
            )

        self.mapping_repo.reject_pending(school.id)
        self._sync_run_school_mapping(school.id, mapped=True)
        provenance = KysMappingProvenance(
            source=DataSource.KYS.value,
            method=method,
            verified_at=datetime.now(timezone.utc).isoformat(),
            evidence={
                "verification": verification.model_dump(),
                "matched_fields": verification.matched_fields,
                "mismatch_fields": verification.mismatch_fields,
            },
        )
        return KysMappingResult(
            school_id=school.id,
            status=KysMappingStatus.MAPPED,
            kys_school_id=kys_school_id,
            udise=udise,
            confidence=verification.confidence,
            method=method,
            candidate_count=1,
            reason=verification.reason,
            provenance=provenance,
            persisted=True,
        )

    def _saras_fields(self, school: School) -> SarasMappingFields:
        return SarasMappingFields.from_school(school)

    def _search_candidates(self, school: School, udise: str | None) -> list[KysSearchCandidate]:
        return self.search_client.search(
            school_name=school.canonical_name,
            state=school.state,
            district=school.district,
            pin_code=school.pin_code,
            udise=udise,
        )

    def get_kys_data_access(self) -> dict:
        """Report what KYS candidate data the resolver can actually access."""
        availability = self.search_client.availability()
        return {
            "programmatic_search_available": availability.programmatic_search_available,
            "reason": availability.reason,
            "probed_paths": availability.probed_paths,
            "automatic_four_field_matching": availability.programmatic_search_available,
            "manual_fallback_required": not availability.programmatic_search_available,
        }

    def _review_result(
        self, school_id: UUID, verification: KysVerificationResult, candidate_count: int
    ) -> KysMappingResult:
        return KysMappingResult(
            school_id=school_id,
            status=KysMappingStatus.REVIEW,
            kys_school_id=verification.kys_school_id,
            udise=verification.kys_identity.get("udise"),
            confidence=verification.confidence,
            candidate_count=candidate_count,
            reason=verification.reason,
        )

    def _school_udise(self, school: School) -> str | None:
        for ident in school.identifiers:
            if ident.identifier_type == IdentifierType.UDISE.value:
                return ident.identifier_value
        return None

    def _sync_run_school_mapping(self, school_id: UUID, *, mapped: bool) -> None:
        items = list(
            self.session.scalars(
                select(CollectionRunSchool).where(CollectionRunSchool.school_id == school_id)
            ).all()
        )
        for item in items:
            if mapped:
                item.kys_mapping_status = "mapped"
                if normalize_school_status(item.collection_status) in {
                    BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value,
                    BatchSchoolCollectionStatus.UNRESOLVED.value,
                }:
                    item.collection_status = BatchSchoolCollectionStatus.KYS_MAPPED.value
                    item.error_summary = None
            else:
                item.kys_mapping_status = "pending"
            self.batch_repo.update_run_school(item)

        for item in items:
            run = item.collection_run
            if not run or not run.parameters:
                continue
            params = dict(run.parameters)
            all_items = self.batch_repo.list_run_schools(run.id)
            from school_intel.domain.collection_contract import compute_stage_progress

            params["stage_progress"] = compute_stage_progress(all_items)
            run.parameters = params
            flag_modified(run, "parameters")
        self.session.flush()


def build_kys_mapping_summary(school, identifiers: dict[str, str]) -> dict:
    """Lightweight KYS mapping state for profile/directory (no live KYS calls)."""
    kys_id = identifiers.get(IdentifierType.KYS_SCHOOL_ID.value)
    udise = identifiers.get(IdentifierType.UDISE.value)
    verified_kys = any(
        i.identifier_type == IdentifierType.KYS_SCHOOL_ID.value and i.is_verified
        for i in school.identifiers
    )
    if verified_kys and kys_id:
        status = "connected"
        label = "KYS Connected"
    else:
        status = "pending"
        label = "KYS Pending"
    return {
        "status": status,
        "label": label,
        "kys_school_id": kys_id,
        "udise": udise,
        "saras_school_code": identifiers.get(IdentifierType.SARAS_SCHOOL_CODE.value),
        "cbse_affiliation": identifiers.get(IdentifierType.CBSE_AFFILIATION.value),
        "can_resolve": not verified_kys,
        "has_kys_collection": verified_kys and udise is not None,
    }
