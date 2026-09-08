from __future__ import annotations

from pydantic import BaseModel, Field

from school_intel.domain.enums import ValidationStatus


class AcademicYearMapping(BaseModel):
    year_id: int
    year_desc: str
    academic_year: str


class EndpointCollectionStatus(BaseModel):
    endpoint: str
    status: str  # success | failed | skipped
    http_status: int | None = None
    api_status: bool | None = None
    validation_status: str | None = None
    error: str | None = None


class YearCollectionSummary(BaseModel):
    academic_year: str
    year_id: int
    endpoints: list[EndpointCollectionStatus] = Field(default_factory=list)

    @property
    def success_count(self) -> int:
        return sum(1 for e in self.endpoints if e.status == "success")

    @property
    def total_count(self) -> int:
        return len(self.endpoints)


class SchoolCollectionSummary(BaseModel):
    school_id: str
    canonical_name: str
    udise: str | None = None
    kys_school_id: str | None = None
    years: list[YearCollectionSummary] = Field(default_factory=list)
    enrollment_checks: dict[str, int | None] = Field(default_factory=dict)
    validation_warnings: list[str] = Field(default_factory=list)
    total_success: int = 0
    total_failed: int = 0
    total_skipped: int = 0
    overall_status: str = "incomplete"

    def compute_totals(self) -> None:
        self.total_success = sum(y.success_count for y in self.years)
        self.total_failed = sum(
            sum(1 for e in y.endpoints if e.status == "failed") for y in self.years
        )
        self.total_skipped = sum(
            sum(1 for e in y.endpoints if e.status == "skipped") for y in self.years
        )
        expected = sum(y.total_count for y in self.years)
        if self.total_failed == 0 and self.total_success == expected and expected > 0:
            self.overall_status = "complete"
        elif self.total_success > 0:
            self.overall_status = "partial"
        else:
            self.overall_status = "failed"


class EnrollmentGoldenCheck(BaseModel):
    academic_year: str
    total: int | None
    boys: int | None = None
    girls: int | None = None
    rte: int | None = None
    ews: int | None = None
    flag3_total: int | None = None
    flag3_validation: ValidationStatus | None = None
