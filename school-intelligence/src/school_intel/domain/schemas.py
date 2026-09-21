from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from school_intel.domain.enums import (
    CollectionOutcomeStatus,
    CollectionRunStatus,
    CollectionRunType,
    DataQualityStatus,
    DataSource,
    IdentityMatchConfidence,
    IdentityStatus,
    IdentifierType,
    ValidationStatus,
)


class SchoolCreate(BaseModel):
    canonical_name: str
    address_line: str | None = None
    district: str | None = None
    state: str | None = None
    pin_code: str | None = None


class SchoolIdentifierInput(BaseModel):
    identifier_type: IdentifierType
    identifier_value: str
    source: DataSource = DataSource.MANUAL
    is_verified: bool = False


class IdentityMatchCandidate(BaseModel):
    school_id: UUID
    canonical_name: str
    confidence: IdentityMatchConfidence
    score: float
    matched_on: list[str] = Field(default_factory=list)
    auto_merge_allowed: bool = False


class IdentityResolutionResult(BaseModel):
    school_id: UUID | None = None
    created: bool = False
    candidates: list[IdentityMatchCandidate] = Field(default_factory=list)
    requires_manual_review: bool = False


class SourceFetchRequest(BaseModel):
    source: DataSource
    endpoint: str
    academic_year: str | None = None
    request_params: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str


class SourceFetchResult(BaseModel):
    raw_payload: dict[str, Any]
    payload_checksum: str
    http_status: int | None = None
    fetched_at: datetime
    endpoint: str | None = None
    request_params: dict[str, Any] = Field(default_factory=dict)


class CollectionRunCreate(BaseModel):
    run_type: CollectionRunType
    source: DataSource
    parameters: dict[str, Any] = Field(default_factory=dict)


class CollectionProgress(BaseModel):
    run_id: UUID
    status: CollectionRunStatus
    processed_count: int
    failed_count: int
    cursor_value: str | None = None
    error_summary: str | None = None


class EnrollmentNormalized(BaseModel):
    academic_year: str
    total_enrollment: int | None
    rte_count: int | None
    provenance: dict[str, Any] = Field(default_factory=dict)


class KysSchoolIdentity(BaseModel):
    canonical_name: str | None = None
    district: str | None = None
    state: str | None = None
    pin_code: str | None = None
    address_line: str | None = None
    udise: str | None = None
    kys_school_id: str | None = None
    state_school_code: str | None = None
    academic_year: str | None = None
    year_id: int | None = None
    provenance: dict[str, Any] = Field(default_factory=dict)


class StudentDistributionNormalized(BaseModel):
    academic_year: str
    distribution_type: str
    reported_total: int | None
    buckets: dict[str, Any] | None = None
    validation_status: ValidationStatus = ValidationStatus.PENDING
    data_quality: dict[str, Any] | None = None
    provenance: dict[str, Any] = Field(default_factory=dict)


class ValidationIssue(BaseModel):
    code: str
    message: str
    severity: str = "warning"
    details: dict[str, Any] = Field(default_factory=dict)


PARSER_VERSION = "1.0.0"


class SarasDirectoryRow(BaseModel):
    serial_no: int | None = None
    affiliation_number: str
    school_code: str | None = None
    school_name: str
    state: str | None = None
    district: str | None = None
    status: str | None = None
    head_name: str | None = None
    address_line: str | None = None
    website: str | None = None
    detail_url: str | None = None
    raw_cells: list[str] = Field(default_factory=list)


class SarasQualityReport(BaseModel):
    total_fetched: int = 0
    successfully_parsed: int = 0
    parse_failures: int = 0
    deterministic_matches: int = 0
    fuzzy_matches: int = 0
    manual_review: int = 0
    potential_duplicates: int = 0
    no_udise: int = 0
    no_matching_evidence: int = 0
    himalyan_identity: str = "NOT_TESTED"


class SchoolValidationReport(BaseModel):
    school_id: UUID
    validation_status: ValidationStatus
    collection_status: CollectionOutcomeStatus | None = None
    identity_status: IdentityStatus = IdentityStatus.UNVERIFIED
    data_quality_status: DataQualityStatus = DataQualityStatus.CLEAN
    issues: list[ValidationIssue] = Field(default_factory=list)
