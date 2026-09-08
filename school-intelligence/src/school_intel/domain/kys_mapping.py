"""KYS source-mapping domain models (separate from canonical school identity)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from school_intel.domain.enums import IdentityMatchConfidence, KysMappingMethod, KysMappingStatus


class KysSearchCandidate(BaseModel):
    kys_school_id: str | None = None
    udise: str | None = None
    school_name: str | None = None
    district: str | None = None
    state: str | None = None
    pin_code: str | None = None
    address_line: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class KysMappingCandidateResult(BaseModel):
    kys_school_id: str | None = None
    udise: str | None = None
    school_name: str | None = None
    district: str | None = None
    pin_code: str | None = None
    address_line: str | None = None
    confidence: IdentityMatchConfidence
    score: float
    method: KysMappingMethod
    matched_fields: dict[str, Any] = Field(default_factory=dict)
    mismatch_fields: dict[str, Any] = Field(default_factory=dict)


class KysMappingProvenance(BaseModel):
    source: str
    method: KysMappingMethod
    verified_at: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    source_record_id: str | None = None


class KysMappingResult(BaseModel):
    school_id: UUID
    status: KysMappingStatus
    kys_school_id: str | None = None
    udise: str | None = None
    confidence: IdentityMatchConfidence | None = None
    method: KysMappingMethod | None = None
    candidate_count: int = 0
    candidates: list[KysMappingCandidateResult] = Field(default_factory=list)
    reason: str = ""
    provenance: KysMappingProvenance | None = None
    persisted: bool = False


class KysVerificationResult(BaseModel):
    valid: bool
    kys_school_id: str
    verdict: str  # verified | review | rejected | invalid
    confidence: IdentityMatchConfidence | None = None
    score: float = 0.0
    kys_identity: dict[str, Any] = Field(default_factory=dict)
    matched_fields: dict[str, Any] = Field(default_factory=dict)
    mismatch_fields: dict[str, Any] = Field(default_factory=dict)
    reason: str = ""
