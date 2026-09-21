from __future__ import annotations

import logging
from typing import Protocol
from uuid import UUID

from school_intel.domain.schemas import SourceFetchRequest, SourceFetchResult


class SourceCollector(Protocol):
    source: str

    def fetch(self, request: SourceFetchRequest) -> SourceFetchResult:
        """Fetch one source payload. Implementations must not normalize here."""

    def build_idempotency_key(self, request: SourceFetchRequest) -> str:
        ...


class AnnualCollectionPlan(Protocol):
    """Defines the KYS annual endpoints that must be collected per school-year."""

    academic_year: str
    endpoints: list[str]


logger = logging.getLogger("school_intel.collectors")
