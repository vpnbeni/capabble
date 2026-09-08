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
    CollectionRunStatus,
    CollectionRunType,
    DataSource,
    IdentifierType,
    ValidationStatus,
)
from school_intel.domain.schemas import SchoolIdentifierInput
from school_intel.repositories.school_repository import CollectionRunRepository, SourceRecordRepository
from school_intel.services.ingestion_service import IngestionService
from school_intel.services.school_identity_service import IdentityLookupInput, SchoolIdentityService
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
        self._owns_collector = collector is None

    def collect_school(
        self,
        udise: str,
        kys_school_id: str | None = None,
        state_school_code: str | None = None,
        verbose: bool = False,
        target_years: list[str] | None = None,
        target_year_ids: list[int] | None = None,
    ) -> SchoolCollectionSummary:
        school, resolved_kys_id = self._resolve_school(
            udise=udise,
            kys_school_id=kys_school_id,
            state_school_code=state_school_code,
        )

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

        summary = SchoolCollectionSummary(
            school_id=str(school.id),
            canonical_name=school.canonical_name,
            udise=udise,
            kys_school_id=resolved_kys_id,
        )

        try:
            years = self.collector.discover_academic_years(resolved_kys_id)
            years = self._filter_years(years, target_years, target_year_ids)
            if not years:
                raise ValueError(f"No academic years discovered for KYS school {resolved_kys_id}")

            for year_mapping in years:
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

                flag3 = self.session.scalar(
                    select(SchoolStudentDistribution).where(
                        SchoolStudentDistribution.school_id == school.id,
                        SchoolStudentDistribution.academic_year == year_mapping.academic_year,
                        SchoolStudentDistribution.distribution_type == "getSocialData:3",
                    )
                )
                if flag3 and flag3.validation_status == ValidationStatus.NON_RECONCILING.value:
                    summary.validation_warnings.append(
                        f"{year_mapping.academic_year} flag=3 non_reconciling "
                        f"({flag3.reported_total} vs {enrollment.total_enrollment if enrollment else '?'})"
                    )

            report = ValidationService().validate_school(self.session, school.id)
            for issue in report.issues:
                if issue.message not in summary.validation_warnings:
                    summary.validation_warnings.append(issue.message)

            summary.compute_totals()
            status = (
                CollectionRunStatus.COMPLETED.value
                if summary.overall_status == "complete"
                else CollectionRunStatus.PAUSED.value
                if summary.total_success > 0
                else CollectionRunStatus.FAILED.value
            )
            self.run_repo.update_progress(
                run.id,
                processed_count=summary.total_success + summary.total_skipped,
                failed_count=summary.total_failed,
                cursor_value=summary.years[-1].academic_year if summary.years else None,
                status=status,
                error_summary="; ".join(summary.validation_warnings[:5]) or None,
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
        identifiers = [
            SchoolIdentifierInput(
                identifier_type=IdentifierType.UDISE,
                identifier_value=udise,
                source=DataSource.KYS,
                is_verified=True,
            )
        ]
        if kys_school_id:
            identifiers.append(
                SchoolIdentifierInput(
                    identifier_type=IdentifierType.KYS_SCHOOL_ID,
                    identifier_value=kys_school_id,
                    source=DataSource.KYS,
                    is_verified=True,
                )
            )
        if state_school_code:
            identifiers.append(
                SchoolIdentifierInput(
                    identifier_type=IdentifierType.STATE_SCHOOL_CODE,
                    identifier_value=state_school_code,
                    source=DataSource.KYS,
                    is_verified=True,
                )
            )

        resolution = self.identity.resolve(
            IdentityLookupInput(canonical_name=f"UDISE {udise}", identifiers=identifiers)
        )
        if not resolution.school_id:
            raise ValueError(f"Could not resolve school for UDISE {udise}")

        school = self.identity.repo.get_by_id(resolution.school_id)
        if not school:
            raise ValueError(f"School not found after resolution: {resolution.school_id}")

        resolved_kys_id = kys_school_id
        if not resolved_kys_id:
            for ident in school.identifiers:
                if ident.identifier_type == IdentifierType.KYS_SCHOOL_ID.value:
                    resolved_kys_id = ident.identifier_value
                    break
        if not resolved_kys_id:
            raise ValueError("KYS schoolId required. Pass --kys-school-id or seed the identifier.")

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
