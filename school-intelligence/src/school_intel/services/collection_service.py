from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from school_intel.collectors.kys_collector import KysCollector
from school_intel.db.models import SchoolEnrollment, SchoolStudentDistribution
from school_intel.domain.collection import (
    AcademicYearMapping,
    EndpointCollectionStatus,
    SchoolCollectionSummary,
    YearCollectionSummary,
)
from school_intel.domain.enums import (
    CollectionOutcomeStatus,
    CollectionRunStatus,
    CollectionRunType,
    DataSource,
    IdentifierType,
    ValidationStatus,
)
from school_intel.parsers.kys_parser import KysParser
from school_intel.repositories.school_repository import CollectionRunRepository, SourceRecordRepository
from school_intel.services.ingestion_service import IngestionService
from school_intel.services.school_identity_service import SchoolIdentityService
from school_intel.services.validation_service import ValidationService

logger = logging.getLogger("school_intel.collection")


class KysCollectionService:
    """Orchestrate live KYS collection with resume, raw storage, and normalization."""

    def __init__(self, session: Session, collector: KysCollector | None = None) -> None:
        self.session = session
        self.collector = collector or KysCollector()
        self.ingestion = IngestionService(session)
        self.source_repo = SourceRecordRepository(session)
        self.run_repo = CollectionRunRepository(session)
        self.identity = SchoolIdentityService(session)
        self.parser = KysParser()
        self._owns_collector = collector is None
        self._discovered_years: list[AcademicYearMapping] | None = None

    def start_school_collection(
        self,
        udise: str,
        kys_school_id: str | None = None,
        state_school_code: str | None = None,
    ):
        """Fast, synchronous setup: resolve identity and create/mark the
        CollectionRun. Callers that want to run the actual (slow, multi-year)
        collection loop in a background thread can call this first to obtain
        a `run.id` to return to the client immediately, then call
        `run_school_collection(...)` for the rest."""
        school, resolved_kys_id = self._resolve_school(
            udise=udise,
            kys_school_id=kys_school_id,
            state_school_code=state_school_code,
        )
        run = self.create_run_for_school(school, resolved_kys_id, udise)
        return school, resolved_kys_id, run

    def create_run_for_school(self, school, resolved_kys_id: str, udise: str):
        """Create/mark a CollectionRun for a school + KYS ID the caller
        already trusts (e.g. an existing verified identifier) — skips the
        live identity-verification round trip `_resolve_school` does (year
        discovery + report-card + profile fetch), which is not actually
        cheap. Use this when you just need a run_id fast, e.g. to return to
        a client immediately before running the real collection loop."""
        run = self.run_repo.create(
            run_type=CollectionRunType.SCHOOL.value,
            source=DataSource.KYS.value,
            parameters={
                "udise": udise,
                "school_id": str(school.id),
                "kys_school_id": resolved_kys_id,
            },
        )
        self.run_repo.mark_running(run.id)
        return run

    def collect_school(
        self,
        udise: str,
        kys_school_id: str | None = None,
        state_school_code: str | None = None,
        verbose: bool = False,
        target_years: list[str] | None = None,
        target_year_ids: list[int] | None = None,
    ) -> SchoolCollectionSummary:
        school, resolved_kys_id, run = self.start_school_collection(
            udise=udise,
            kys_school_id=kys_school_id,
            state_school_code=state_school_code,
        )
        return self.run_school_collection(
            school,
            resolved_kys_id,
            run,
            udise,
            verbose=verbose,
            target_years=target_years,
            target_year_ids=target_year_ids,
        )

    def run_school_collection(
        self,
        school,
        resolved_kys_id: str,
        run,
        udise: str,
        verbose: bool = False,
        target_years: list[str] | None = None,
        target_year_ids: list[int] | None = None,
    ) -> SchoolCollectionSummary:
        """The actual (potentially slow) multi-year collection loop, given an
        already-resolved school and already-created run. Safe to run in a
        background thread on its own session — checks `run.status` for
        cancellation between years."""
        summary = SchoolCollectionSummary(
            school_id=str(school.id),
            canonical_name=school.canonical_name,
            udise=udise,
            kys_school_id=resolved_kys_id,
        )

        try:
            # Cache discovery across calls on this service instance — this was
            # previously read (`self._discovered_years or ...`) but never
            # written, so every call (e.g. once per year from an external
            # per-year loop) silently re-ran full year discovery from scratch.
            if self._discovered_years is None:
                self._discovered_years = self.collector.discover_academic_years(resolved_kys_id)
            years = self._filter_years(self._discovered_years, target_years, target_year_ids)
            if not years:
                raise ValueError(f"No academic years discovered for KYS school {resolved_kys_id}")

            cancelled = False
            for year_mapping in years:
                self.session.refresh(run)
                if run.status == CollectionRunStatus.CANCELLED.value:
                    cancelled = True
                    break
                year_summary = self._collect_year(
                    school_id=school.id,
                    kys_school_id=resolved_kys_id,
                    year_mapping=year_mapping,
                    collection_run_id=run.id,
                    verbose=verbose,
                )
                summary.years.append(year_summary)
                enrollment = self.session.scalar(
                    select(SchoolEnrollment).where(
                        SchoolEnrollment.school_id == school.id,
                        SchoolEnrollment.academic_year == year_mapping.academic_year,
                        SchoolEnrollment.source == DataSource.KYS.value,
                    )
                )
                summary.enrollment_checks[year_mapping.academic_year] = (
                    enrollment.total_enrollment if enrollment else None
                )

                # Checkpoint progress after each year — and actually commit
                # (update_progress only flushes), so a poller on a different
                # DB connection (e.g. the sync-status/active-syncs endpoints)
                # can see live progress instead of nothing until the very end.
                failed_so_far = sum(1 for y in summary.years for e in y.endpoints if e.status == "failed")
                self.run_repo.update_progress(
                    run.id,
                    processed_count=len(summary.years),
                    failed_count=failed_so_far,
                    cursor_value=year_mapping.academic_year,
                )
                self.session.commit()

            summary.compute_totals()
            report = ValidationService().validate_school(
                self.session,
                school.id,
                collection_status=summary.collection_status,
            )
            summary.identity_status = report.identity_status.value
            summary.data_quality_status = report.data_quality_status.value
            summary.data_quality_issue_count = len(report.issues)
            summary.validation_warnings = [issue.message for issue in report.issues]

            status = (
                CollectionRunStatus.CANCELLED.value
                if cancelled
                else CollectionRunStatus.COMPLETED.value
                if summary.collection_status == CollectionOutcomeStatus.COMPLETE.value
                else CollectionRunStatus.PAUSED.value
                if summary.collection_status == CollectionOutcomeStatus.PARTIAL.value
                else CollectionRunStatus.FAILED.value
            )
            error_summary = "; ".join(summary.validation_warnings[:5]) or None
            if cancelled:
                next_year = years[len(summary.years)].academic_year if len(summary.years) < len(years) else None
                error_summary = f"Cancelled before collecting {next_year}" if next_year else "Cancelled"
            self.run_repo.update_progress(
                run.id,
                processed_count=summary.total_success + summary.total_skipped,
                failed_count=summary.total_failed,
                cursor_value=summary.years[-1].academic_year if summary.years else None,
                status=status,
                error_summary=error_summary,
            )
            return summary
        except Exception as exc:
            self.run_repo.update_progress(
                run.id,
                processed_count=0,
                failed_count=1,
                status=CollectionRunStatus.FAILED.value,
                error_summary=str(exc),
            )
            raise
        finally:
            if self._owns_collector:
                self.collector.close()

    def collect_year(
        self,
        udise: str,
        year: str,
        kys_school_id: str | None = None,
        state_school_code: str | None = None,
        verbose: bool = False,
    ) -> SchoolCollectionSummary:
        if year.isdigit():
            return self.collect_school(
                udise=udise,
                kys_school_id=kys_school_id,
                state_school_code=state_school_code,
                verbose=verbose,
                target_year_ids=[int(year)],
            )
        return self.collect_school(
            udise=udise,
            kys_school_id=kys_school_id,
            state_school_code=state_school_code,
            verbose=verbose,
            target_years=[year],
        )

    def _resolve_school(
        self,
        udise: str,
        kys_school_id: str | None,
        state_school_code: str | None,
    ):
        resolved_kys_id = kys_school_id
        if not resolved_kys_id:
            existing = self.identity.repo.find_identifier(
                IdentifierType.UDISE.value, udise
            )
            if existing:
                school = self.identity.repo.get_by_id(existing.school_id)
                if school:
                    for ident in school.identifiers:
                        if ident.identifier_type == IdentifierType.KYS_SCHOOL_ID.value:
                            resolved_kys_id = ident.identifier_value
                            break
        if not resolved_kys_id:
            raise ValueError("KYS schoolId required. Pass --kys-school-id or seed the identifier.")

        latest_year, discovered_years, report_result, profile_result = (
            self.collector.fetch_identity_reference(resolved_kys_id)
        )
        self._discovered_years = discovered_years

        kys_identity = self.parser.parse_school_identity(
            report_result.raw_payload,
            profile_result.raw_payload,
            kys_school_id=resolved_kys_id,
            state_school_code=state_school_code,
            academic_year=latest_year.academic_year,
            year_id=latest_year.year_id,
        )

        lookup = self.identity.build_lookup_from_kys_identity(
            kys_identity,
            udise=udise,
            kys_school_id=resolved_kys_id,
            state_school_code=state_school_code,
        )

        resolution = self.identity.resolve(lookup)
        if not resolution.school_id:
            raise ValueError(f"Could not resolve school for UDISE {udise}")

        self.identity.enrich_school_identity(resolution.school_id, kys_identity)

        school = self.identity.repo.get_by_id(resolution.school_id)
        if not school:
            raise ValueError(f"School not found after resolution: {resolution.school_id}")

        return school, resolved_kys_id

    def _filter_years(
        self,
        years: list[AcademicYearMapping],
        target_years: list[str] | None,
        target_year_ids: list[int] | None,
    ) -> list[AcademicYearMapping]:
        if target_years:
            return [y for y in years if y.academic_year in target_years]
        if target_year_ids:
            return [y for y in years if y.year_id in target_year_ids]
        return years

    def _collect_year(
        self,
        school_id: UUID,
        kys_school_id: str,
        year_mapping: AcademicYearMapping,
        collection_run_id: UUID,
        verbose: bool,
    ) -> YearCollectionSummary:
        year_summary = YearCollectionSummary(
            academic_year=year_mapping.academic_year,
            year_id=year_mapping.year_id,
        )

        requests = self.collector.annual_requests(
            kys_school_id, year_mapping.year_id, year_mapping.academic_year
        )

        for request in requests:
            status = self._collect_endpoint(
                school_id=school_id,
                kys_school_id=kys_school_id,
                year_mapping=year_mapping,
                request=request,
                collection_run_id=collection_run_id,
                verbose=verbose,
            )
            year_summary.endpoints.append(status)

        return year_summary

    def _collect_endpoint(
        self,
        school_id: UUID,
        kys_school_id: str,
        year_mapping: AcademicYearMapping,
        request,
        collection_run_id: UUID,
        verbose: bool,
    ) -> EndpointCollectionStatus:
        flag = request.request_params.get("flag")
        idempotency_key = self.collector.build_idempotency_key(
            request.endpoint,
            kys_school_id,
            year_mapping.year_id,
            flag=flag,
        )

        existing = self.source_repo.get_by_idempotency_key(idempotency_key)
        if existing:
            if verbose:
                logger.info("skip_fetch idempotency_key=%s", idempotency_key)
            try:
                validation = self.ingestion.ingest_kys_payload(
                    school_id=school_id,
                    academic_year=year_mapping.academic_year,
                    year_id=year_mapping.year_id,
                    endpoint=request.endpoint,
                    raw_payload=existing.raw_payload,
                    source_record_id=existing.id,
                    http_status=existing.http_status,
                )
                return EndpointCollectionStatus(
                    endpoint=request.endpoint,
                    status="skipped",
                    http_status=existing.http_status,
                    api_status=self.collector.is_api_success(
                        existing.raw_payload, existing.http_status or 0
                    ),
                    validation_status=validation,
                )
            except Exception as exc:
                return EndpointCollectionStatus(
                    endpoint=request.endpoint,
                    status="failed",
                    error=f"ingest_from_cache: {exc}",
                )

        try:
            result = self.collector.fetch(request)
            api_ok = self.collector.is_api_success(result.raw_payload, result.http_status or 0)

            record, _ = self.source_repo.create_if_absent(
                school_id=school_id,
                collection_run_id=collection_run_id,
                source=DataSource.KYS.value,
                endpoint=request.endpoint,
                academic_year=year_mapping.academic_year,
                request_params={
                    **request.request_params,
                    "yearDesc": year_mapping.year_desc,
                    "yearId": year_mapping.year_id,
                },
                raw_payload=result.raw_payload,
                payload_checksum=result.payload_checksum,
                http_status=result.http_status,
                idempotency_key=idempotency_key,
            )

            if not api_ok:
                error_msg = result.raw_payload.get("error") or result.raw_payload.get("message")
                return EndpointCollectionStatus(
                    endpoint=request.endpoint,
                    status="failed",
                    http_status=result.http_status,
                    api_status=False,
                    error=str(error_msg) if error_msg else "API returned unsuccessful status",
                )

            validation = self.ingestion.ingest_kys_payload(
                school_id=school_id,
                academic_year=year_mapping.academic_year,
                year_id=year_mapping.year_id,
                endpoint=request.endpoint,
                raw_payload=result.raw_payload,
                source_record_id=record.id,
                http_status=result.http_status,
            )

            return EndpointCollectionStatus(
                endpoint=request.endpoint,
                status="success",
                http_status=result.http_status,
                api_status=True,
                validation_status=validation,
            )
        except Exception as exc:
            logger.exception("endpoint_failed endpoint=%s", request.endpoint)
            return EndpointCollectionStatus(
                endpoint=request.endpoint,
                status="failed",
                error=str(exc),
            )
