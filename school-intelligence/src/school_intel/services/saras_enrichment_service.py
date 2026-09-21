"""Persist full SARAS discovery/detail payloads for batch collection run schools."""

from __future__ import annotations

import logging
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy.orm.attributes import flag_modified

from school_intel.collectors.saras_collector import SarasCollector
from school_intel.db.models import CollectionRunSchool, SarasSchoolRecord
from school_intel.domain.enums import DataSource, IdentifierType
from school_intel.domain.schemas import SarasDirectoryRow, SchoolIdentifierInput
from school_intel.parsers.saras_parser import SarasParser
from school_intel.repositories.batch_collection_repository import BatchCollectionRepository
from school_intel.repositories.saras_repository import SarasRepository
from school_intel.repositories.school_repository import SchoolRepository, SourceRecordRepository
from school_intel.services.school_identity_service import SchoolIdentityService
from school_intel.utils.text import normalize_address, normalize_school_name

logger = logging.getLogger("school_intel.saras_enrichment")

PARSER_VERSION = "1.0.0"


class SarasEnrichmentService:
    def __init__(self, session, collector: SarasCollector | None = None) -> None:
        self.session = session
        self.collector = collector or SarasCollector()
        self.parser = SarasParser()
        self.batch_repo = BatchCollectionRepository(session)
        self.source_repo = SourceRecordRepository(session)
        self.saras_repo = SarasRepository(session)
        self.school_repo = SchoolRepository(session)
        self.identity = SchoolIdentityService(session)
        self._owns_collector = collector is None

    def close(self) -> None:
        if self._owns_collector:
            self.collector.close()

    def enrich_run(self, run_id: UUID, *, live_fetch: bool = True) -> dict[str, Any]:
        items = self.batch_repo.list_run_schools(run_id)
        results = []
        for item in items:
            results.append(self.enrich_run_school(item, live_fetch=live_fetch))
        return {"run_id": str(run_id), "schools": results, "enriched": len(results)}

    def re_enrich_run(self, run_id: UUID) -> dict[str, Any]:
        """Re-apply SARAS enrichment for all schools in an existing collection run.

        Uses stored detail_fields when present (preserves source_records provenance).
        Does not run KYS mapping or historical collection.
        """
        items = self.batch_repo.list_run_schools(run_id)
        if not items:
            raise ValueError(f"No schools found for collection run: {run_id}")

        school_results: list[dict[str, Any]] = []
        for item in items:
            has_stored_detail = bool((item.saras_row or {}).get("detail_fields"))
            result = self.enrich_run_school(item, live_fetch=not has_stored_detail)
            school_results.append(
                {
                    **result,
                    "school_name": item.school_name,
                    "address_line": (item.saras_row or {}).get("address_line"),
                }
            )

        return {
            "run_id": str(run_id),
            "total": len(items),
            "enriched": len(school_results),
            "schools": school_results,
        }

    def enrich_run_school(self, item: CollectionRunSchool, *, live_fetch: bool = True) -> dict[str, Any]:
        affiliation = item.affiliation_number
        directory_row: SarasDirectoryRow | None = None
        directory_source_id = None
        detail_source_id = None
        detail_fields: dict[str, Any] = {}

        if live_fetch:
            directory_row, directory_source_id = self._fetch_directory_row(item)
            detail_fields, detail_source_id = self._fetch_detail(affiliation, item)
        else:
            detail_fields = (item.saras_row or {}).get("detail_fields") or {}

        saras_code = (
            (directory_row.school_code if directory_row else None)
            or item.school_code
            or (item.saras_row or {}).get("saras_school_code")
        )
        pin_code = (
            detail_fields.get("Pin Code")
            or detail_fields.get("PIN")
            or (item.saras_row or {}).get("pin_code")
            or (directory_row and self._pin_from_row(directory_row))
        )
        if pin_code is not None:
            pin_code = str(pin_code).strip()

        saras_payload = self._build_saras_row(item, directory_row, detail_fields, saras_code, pin_code)
        item.saras_row = saras_payload
        flag_modified(item, "saras_row")
        if directory_row:
            item.school_name = directory_row.school_name or item.school_name
            item.district = directory_row.district or item.district
            item.state = directory_row.state or item.state
            item.school_code = saras_code
        self.batch_repo.update_run_school(item)

        if item.school_id:
            self._update_school_from_saras(item.school_id, saras_payload)
            self._attach_saras_identifiers(
                item.school_id,
                affiliation,
                saras_code,
                directory_source_id,
                detail_source_id,
            )
            if directory_source_id or detail_source_id:
                self._link_source_records_to_school(
                    item.school_id,
                    item.collection_run_id,
                    directory_source_id,
                    detail_source_id,
                )

        saras_record = SarasSchoolRecord(
            id=uuid.uuid4(),
            affiliation_number=affiliation,
            school_code=saras_code,
            school_name=saras_payload.get("school_name") or item.school_name,
            normalized_name=normalize_school_name(saras_payload.get("school_name") or item.school_name),
            state=saras_payload.get("state"),
            district=saras_payload.get("district"),
            status=saras_payload.get("status"),
            head_name=saras_payload.get("head_name"),
            address_line=saras_payload.get("address_line"),
            normalized_address=normalize_address(saras_payload.get("address_line") or ""),
            pin_code=pin_code,
            website=saras_payload.get("website"),
            detail_url=saras_payload.get("detail_url"),
            school_id=item.school_id,
            source_record_id=directory_source_id,
            detail_source_record_id=detail_source_id,
            raw_row=directory_row.model_dump() if directory_row else saras_payload.get("directory_row"),
            detail_fields=detail_fields or None,
            parser_version=PARSER_VERSION,
        )
        self.saras_repo.upsert_record(saras_record)

        return {
            "affiliation": affiliation,
            "school_id": str(item.school_id) if item.school_id else None,
            "saras_school_code": saras_code,
            "directory_source_record_id": str(directory_source_id) if directory_source_id else None,
            "detail_source_record_id": str(detail_source_id) if detail_source_id else None,
            "detail_field_count": len(detail_fields),
        }

    def _fetch_directory_row(
        self, item: CollectionRunSchool
    ) -> tuple[SarasDirectoryRow | None, UUID | None]:
        keyword = item.affiliation_number
        fetch = self.collector.fetch_keyword_directory(keyword)
        idempotency_key = f"saras|keyword|affiliation|{keyword}"
        record, _ = self.source_repo.create_if_absent(
            school_id=item.school_id,
            collection_run_id=item.collection_run_id,
            source=DataSource.SARAS.value,
            endpoint=f"directory:keyword:affiliation={keyword}",
            academic_year=None,
            request_params=fetch.request_params,
            raw_payload={
                "html": fetch.html,
                "url": fetch.url,
                "fetched_at": fetch.fetched_at.isoformat(),
            },
            payload_checksum=fetch.payload_checksum,
            http_status=fetch.http_status,
            idempotency_key=idempotency_key,
        )
        rows, _errors = self.parser.parse_directory_html(fetch.html)
        match = next((row for row in rows if row.affiliation_number == item.affiliation_number), None)
        if not match and rows:
            match = rows[0]
        return match, record.id

    def _fetch_detail(
        self, affiliation: str, item: CollectionRunSchool
    ) -> tuple[dict[str, Any], UUID | None]:
        detail_key = self.collector.build_detail_idempotency_key(affiliation)
        existing = self.source_repo.get_by_idempotency_key(detail_key)
        if existing:
            return self.parser.parse_detail_html(existing.raw_payload.get("html", "")), existing.id

        detail_fetch = self.collector.fetch_detail_page(affiliation)
        if detail_fetch.http_status != 200:
            return {}, None
        record, _ = self.source_repo.create_if_absent(
            school_id=item.school_id,
            collection_run_id=item.collection_run_id,
            source=DataSource.SARAS.value,
            endpoint=f"detail:{affiliation}",
            academic_year=None,
            request_params=detail_fetch.request_params,
            raw_payload={
                "html": detail_fetch.html,
                "url": detail_fetch.url,
                "fetched_at": detail_fetch.fetched_at.isoformat(),
            },
            payload_checksum=detail_fetch.payload_checksum,
            http_status=detail_fetch.http_status,
            idempotency_key=detail_key,
        )
        return self.parser.parse_detail_html(detail_fetch.html), record.id

    def _build_saras_row(
        self,
        item: CollectionRunSchool,
        directory_row: SarasDirectoryRow | None,
        detail_fields: dict[str, Any],
        saras_code: str | None,
        pin_code: str | None,
    ) -> dict[str, Any]:
        existing = dict(item.saras_row or {})
        row = directory_row.model_dump() if directory_row else {}
        detail_address = self._address_from_detail_fields(detail_fields)
        payload = {
            **existing,
            "affiliation_number": item.affiliation_number,
            "cbse_affiliation": item.affiliation_number,
            "saras_school_code": saras_code,
            "school_name": row.get("school_name") or existing.get("school_name") or item.school_name,
            "state": row.get("state") or existing.get("state") or item.state,
            "district": row.get("district") or existing.get("district") or item.district,
            "status": row.get("status") or existing.get("status"),
            "head_name": row.get("head_name") or existing.get("head_name") or detail_fields.get("Head/Principal"),
            "address_line": self._coalesce_text(
                row.get("address_line"),
                existing.get("address_line"),
                detail_address,
            ),
            "pin_code": pin_code,
            "website": row.get("website") or existing.get("website") or detail_fields.get("Website"),
            "detail_url": row.get("detail_url") or existing.get("detail_url"),
            "foundation_year": detail_fields.get("Year of Foundation") or existing.get("foundation_year"),
            "affiliation_period": detail_fields.get("Period of Affiliation") or existing.get("affiliation_period"),
            "school_type": detail_fields.get("School Type") or existing.get("school_type"),
            "managing_society": detail_fields.get("Name of Society/Trust") or existing.get("managing_society"),
            "directory_row": row or existing.get("directory_row"),
            "detail_fields": {**existing.get("detail_fields", {}), **detail_fields},
            "retrieved_at": detail_fields.get("_retrieved_at") or existing.get("retrieved_at"),
        }
        return payload

    def _update_school_from_saras(self, school_id: UUID, saras_payload: dict[str, Any]) -> None:
        school = self.school_repo.get_by_id(school_id)
        if not school:
            return
        if saras_payload.get("address_line") and not school.address_line:
            school.address_line = saras_payload["address_line"]
        if saras_payload.get("district") and not school.district:
            school.district = saras_payload["district"]
        if saras_payload.get("state") and not school.state:
            school.state = saras_payload["state"]
        if saras_payload.get("pin_code") and not school.pin_code:
            school.pin_code = str(saras_payload["pin_code"]).strip()
        self.session.flush()

    def _attach_saras_identifiers(
        self,
        school_id: UUID,
        affiliation: str,
        saras_code: str | None,
        directory_source_id: UUID | None,
        detail_source_id: UUID | None,
    ) -> None:
        identifiers = [
            SchoolIdentifierInput(
                identifier_type=IdentifierType.CBSE_AFFILIATION,
                identifier_value=affiliation,
                source=DataSource.SARAS,
                is_verified=True,
            ),
        ]
        if saras_code:
            identifiers.append(
                SchoolIdentifierInput(
                    identifier_type=IdentifierType.SARAS_SCHOOL_CODE,
                    identifier_value=saras_code,
                    source=DataSource.SARAS,
                    is_verified=True,
                )
            )
        self.identity.attach_identifiers(school_id, identifiers)

    def _link_source_records_to_school(
        self,
        school_id: UUID,
        run_id: UUID,
        directory_source_id: UUID | None,
        detail_source_id: UUID | None,
    ) -> None:
        from school_intel.db.models import SourceRecord

        for record_id in (directory_source_id, detail_source_id):
            if not record_id:
                continue
            record = self.session.get(SourceRecord, record_id)
            if not record:
                continue
            if record.school_id is None:
                record.school_id = school_id
            if record.collection_run_id is None:
                record.collection_run_id = run_id
        self.session.flush()

    @staticmethod
    def _coalesce_text(*candidates: Any) -> str | None:
        for value in candidates:
            if value is not None and str(value).strip():
                return str(value).strip()
        return None

    @staticmethod
    def _address_from_detail_fields(detail_fields: dict[str, Any]) -> str | None:
        """SARAS detail pages expose the postal address under 'Postal Address'."""
        return SarasEnrichmentService._coalesce_text(
            detail_fields.get("Postal Address"),
            detail_fields.get("Address"),
            detail_fields.get("address"),
        )

    @staticmethod
    def _pin_from_row(row: SarasDirectoryRow) -> str | None:
        if not row.address_line:
            return None
        import re

        match = re.search(r"\b(\d{6})\b", row.address_line)
        return match.group(1) if match else None
