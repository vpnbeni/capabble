from __future__ import annotations

import logging
import uuid
from uuid import UUID

from school_intel.collectors.saras_collector import SarasCollector
from school_intel.db.models import SarasSchoolRecord, School, SchoolIdentifier
from school_intel.domain.enums import (
    CollectionRunStatus,
    CollectionRunType,
    DataSource,
    IdentifierType,
    MatchingMethod,
)
from school_intel.domain.schemas import SarasDirectoryRow, SarasQualityReport, SchoolIdentifierInput
from school_intel.parsers.saras_parser import SarasParser
from school_intel.repositories.saras_repository import SarasRepository
from school_intel.repositories.school_repository import CollectionRunRepository, SourceRecordRepository
from school_intel.services.school_identity_service import IdentityLookupInput, SchoolIdentityService
from school_intel.utils.text import normalize_address, normalize_school_name

logger = logging.getLogger("school_intel.saras")

PARSER_VERSION = "1.0.0"


class SarasCollectionService:
    def __init__(self, session, collector: SarasCollector | None = None) -> None:
        self.session = session
        self.collector = collector or SarasCollector()
        self.parser = SarasParser()
        self.saras_repo = SarasRepository(session)
        self.source_repo = SourceRecordRepository(session)
        self.run_repo = CollectionRunRepository(session)
        self.identity = SchoolIdentityService(session)
        self._owns_collector = collector is None

    def test_sample(self, keyword: str = "DELHI PUBLIC SCHOOL") -> dict:
        """Controlled live sample: fetch, parse, optional detail."""
        fetch = self.collector.fetch_keyword_directory(keyword)
        rows, errors = self.parser.parse_directory_html(fetch.html)
        sample = rows[0] if rows else None
        detail_fields = {}
        if sample and sample.affiliation_number:
            detail = self.collector.fetch_detail_page(sample.affiliation_number)
            detail_fields = self.parser.parse_detail_html(detail.html)
        return {
            "http_status": fetch.http_status,
            "html_length": len(fetch.html),
            "parsed_rows": len(rows),
            "parse_errors": errors[:5],
            "sample": sample.model_dump() if sample else None,
            "detail_fields": dict(list(detail_fields.items())[:10]),
        }

    def collect(self, limit: int | None = 100, resume: bool = False) -> SarasQualityReport:
        run = self._get_or_create_run(resume)
        self.run_repo.mark_running(run.id)

        report = SarasQualityReport()
        state_ids = self.collector.list_state_ids()
        start_state_idx = 0
        if resume and run.cursor_value and ":" in run.cursor_value:
            start_state_idx = int(run.cursor_value.split(":", 1)[0])

        processed_this_run = 0
        try:
            for state_idx in range(start_state_idx, len(state_ids)):
                state_id = state_ids[state_idx]
                if limit is not None and processed_this_run >= limit:
                    break

                idempotency_key = self.collector.build_directory_idempotency_key(state_id)
                existing_raw = self.source_repo.get_by_idempotency_key(idempotency_key)
                if existing_raw:
                    html = existing_raw.raw_payload.get("html", "")
                    source_record_id = existing_raw.id
                    http_status = existing_raw.http_status
                else:
                    fetch = self.collector.fetch_state_directory(state_id)
                    if fetch.http_status != 200:
                        run.failed_count += 1
                        continue
                    record, _ = self.source_repo.create_if_absent(
                        school_id=None,
                        collection_run_id=run.id,
                        source=DataSource.SARAS.value,
                        endpoint=f"directory:state={state_id}",
                        academic_year=None,
                        request_params=fetch.request_params,
                        raw_payload={"html": fetch.html, "url": fetch.url},
                        payload_checksum=fetch.payload_checksum,
                        http_status=fetch.http_status,
                        idempotency_key=idempotency_key,
                    )
                    html = fetch.html
                    source_record_id = record.id
                    http_status = fetch.http_status

                rows, errors = self.parser.parse_directory_html(html)
                report.parse_failures += len(errors)
                for row in rows:
                    if limit is not None and processed_this_run >= limit:
                        break
                    if self.saras_repo.get_by_affiliation(row.affiliation_number):
                        continue
                    report.total_fetched += 1
                    processed_this_run += 1
                    self._ingest_row(row, source_record_id, http_status, report)

                self.run_repo.update_progress(
                    run.id,
                    processed_count=run.processed_count + processed_this_run,
                    failed_count=run.failed_count,
                    cursor_value=f"{state_idx + 1}:0",
                    status=CollectionRunStatus.RUNNING.value,
                )

            report.himalyan_identity = self._evaluate_himalyan_identity()
            status = CollectionRunStatus.COMPLETED.value
            if limit is not None and processed_this_run < limit and start_state_idx == 0:
                status = CollectionRunStatus.COMPLETED.value
            self.run_repo.update_progress(
                run.id,
                processed_count=run.processed_count + processed_this_run,
                failed_count=run.failed_count,
                cursor_value=run.cursor_value,
                status=status,
            )
            return report
        finally:
            if self._owns_collector:
                self.collector.close()

    def search_keyword(self, keyword: str) -> SarasQualityReport:
        """Keyword search ingestion (used for Himalyan absence verification)."""
        report = SarasQualityReport()
        fetch = self.collector.fetch_keyword_directory(keyword)
        rows, errors = self.parser.parse_directory_html(fetch.html)
        report.parse_failures = len(errors)
        idempotency_key = f"saras|keyword|{normalize_school_name(keyword)}"
        record, _ = self.source_repo.create_if_absent(
            school_id=None,
            collection_run_id=None,
            source=DataSource.SARAS.value,
            endpoint="directory:keyword",
            academic_year=None,
            request_params=fetch.request_params,
            raw_payload={"html": fetch.html, "url": fetch.url},
            payload_checksum=fetch.payload_checksum,
            http_status=fetch.http_status,
            idempotency_key=idempotency_key,
        )
        for row in rows:
            report.total_fetched += 1
            self._ingest_row(row, record.id, fetch.http_status, report)
        report.himalyan_identity = self._evaluate_himalyan_identity()
        return report

    def _ingest_row(
        self,
        row: SarasDirectoryRow,
        source_record_id: UUID,
        http_status: int | None,
        report: SarasQualityReport,
    ) -> None:
        try:
            detail_fields = {}
            detail_source_id = None
            if row.affiliation_number:
                detail_key = self.collector.build_detail_idempotency_key(row.affiliation_number)
                existing_detail = self.source_repo.get_by_idempotency_key(detail_key)
                if existing_detail:
                    detail_fields = self.parser.parse_detail_html(
                        existing_detail.raw_payload.get("html", "")
                    )
                    detail_source_id = existing_detail.id
                else:
                    detail_fetch = self.collector.fetch_detail_page(row.affiliation_number)
                    if detail_fetch.http_status == 200:
                        detail_record, _ = self.source_repo.create_if_absent(
                            school_id=None,
                            collection_run_id=None,
                            source=DataSource.SARAS.value,
                            endpoint=f"detail:{row.affiliation_number}",
                            academic_year=None,
                            request_params=detail_fetch.request_params,
                            raw_payload={"html": detail_fetch.html, "url": detail_fetch.url},
                            payload_checksum=detail_fetch.payload_checksum,
                            http_status=detail_fetch.http_status,
                            idempotency_key=detail_key,
                        )
                        detail_fields = self.parser.parse_detail_html(detail_fetch.html)
                        detail_source_id = detail_record.id

            pin_code = detail_fields.get("Pin Code")
            saras_record = SarasSchoolRecord(
                id=uuid.uuid4(),
                affiliation_number=row.affiliation_number,
                school_code=row.school_code,
                school_name=row.school_name,
                normalized_name=normalize_school_name(row.school_name),
                state=row.state,
                district=row.district,
                status=row.status,
                head_name=row.head_name,
                address_line=row.address_line,
                normalized_address=normalize_address(row.address_line or ""),
                pin_code=str(pin_code).strip() if pin_code else None,
                website=row.website,
                detail_url=row.detail_url,
                source_record_id=source_record_id,
                detail_source_record_id=detail_source_id,
                raw_row=row.model_dump(),
                detail_fields=detail_fields or None,
                parser_version=PARSER_VERSION,
            )

            resolution = self.identity.resolve(
                IdentityLookupInput(
                    canonical_name=row.school_name,
                    district=row.district,
                    state=row.state,
                    pin_code=saras_record.pin_code,
                    address_line=row.address_line,
                    identifiers=[
                        SchoolIdentifierInput(
                            identifier_type=IdentifierType.CBSE_AFFILIATION,
                            identifier_value=row.affiliation_number,
                            source=DataSource.SARAS,
                            is_verified=True,
                        )
                    ],
                    source=DataSource.SARAS,
                    source_payload=row.model_dump(),
                    source_record_id=source_record_id,
                ),
                create_if_missing=True,
            )

            if resolution.school_id:
                saras_record.school_id = resolution.school_id
                if resolution.requires_manual_review:
                    saras_record.requires_manual_review = True
                    saras_record.identity_match_method = MatchingMethod.FUZZY_NAME_ADDRESS.value
                    saras_record.identity_confidence = (
                        resolution.candidates[0].score if resolution.candidates else None
                    )
                    report.manual_review += 1
                    report.fuzzy_matches += 1
                else:
                    method = (
                        resolution.candidates[0].matched_on[0]
                        if resolution.candidates
                        else MatchingMethod.EXACT_CBSE_AFFILIATION.value
                    )
                    saras_record.identity_match_method = method
                    saras_record.identity_confidence = 100.0 if resolution.created else (
                        resolution.candidates[0].score if resolution.candidates else 100.0
                    )
                    if method in {
                        MatchingMethod.EXACT_CBSE_AFFILIATION.value,
                        MatchingMethod.EXACT_UDISE.value,
                        MatchingMethod.EXACT_STATE_SCHOOL_CODE.value,
                        MatchingMethod.DETERMINISTIC_COMBO.value,
                        MatchingMethod.NAME_DISTRICT_PIN.value,
                    }:
                        report.deterministic_matches += 1
                    else:
                        report.fuzzy_matches += 1
                self.identity.attach_identifiers(
                    resolution.school_id,
                    [
                        SchoolIdentifierInput(
                            identifier_type=IdentifierType.CBSE_AFFILIATION,
                            identifier_value=row.affiliation_number,
                            source=DataSource.SARAS,
                            is_verified=True,
                        )
                    ],
                )
            else:
                report.no_matching_evidence += 1

            report.no_udise += 1
            self.saras_repo.upsert_record(saras_record)
            report.successfully_parsed += 1
        except Exception:
            logger.exception("saras_ingest_failed affiliation=%s", row.affiliation_number)
            report.parse_failures += 1

    def _evaluate_himalyan_identity(self) -> str:
        """Verify known Himalyan identifiers resolve to a single canonical school."""
        from sqlalchemy import select

        udise = "06140404094"
        state_code = "25299"
        kys_id = "1519942"

        ids = []
        for id_type, value in [
            (IdentifierType.UDISE, udise),
            (IdentifierType.STATE_SCHOOL_CODE, state_code),
            (IdentifierType.KYS_SCHOOL_ID, kys_id),
        ]:
            ident = self.identity.repo.find_identifier(id_type.value, value)
            if ident:
                ids.append(ident.school_id)

        if not ids:
            return "SKIP_NO_SEEDED_IDENTIFIERS"

        if len(set(ids)) == 1:
            return "PASS"

        return f"FAIL_MULTIPLE_SCHOOLS:{len(set(ids))}"

    def show_affiliation(self, affiliation_number: str) -> dict | None:
        record = self.saras_repo.get_by_affiliation(affiliation_number)
        if not record:
            return None
        return {
            "affiliation_number": record.affiliation_number,
            "school_name": record.school_name,
            "state": record.state,
            "district": record.district,
            "status": record.status,
            "school_id": str(record.school_id) if record.school_id else None,
            "identity_match_method": record.identity_match_method,
            "requires_manual_review": record.requires_manual_review,
            "detail_url": record.detail_url,
        }

    def _get_or_create_run(self, resume: bool):
        if resume:
            from sqlalchemy import select
            from school_intel.db.models import CollectionRun

            run = self.session.scalar(
                select(CollectionRun)
                .where(
                    CollectionRun.source == DataSource.SARAS.value,
                    CollectionRun.status.in_(
                        [CollectionRunStatus.RUNNING.value, CollectionRunStatus.PAUSED.value]
                    ),
                )
                .order_by(CollectionRun.created_at.desc())
            )
            if run:
                return run
        return self.run_repo.create(
            run_type=CollectionRunType.BATCH.value,
            source=DataSource.SARAS.value,
            parameters={"source": "saras_directory"},
        )
