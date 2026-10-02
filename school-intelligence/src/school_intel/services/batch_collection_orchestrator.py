from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from school_intel.collectors.kys_collector import KysCollector
from school_intel.collectors.saras_collector import SarasCollector
from school_intel.db.models import CollectionRunSchool
from school_intel.domain.collection_constants import years_in_range
from school_intel.domain.collection_contract import (
    aggregate_run_progress,
    compute_stage_progress as contract_compute_stage_progress,
    derive_run_status,
    is_terminal_school_status,
    is_terminal_success,
    normalize_school_status,
    pipeline_metadata_for_source,
    pipeline_display_for_run,
)
from school_intel.domain.enums import (
    BatchSchoolCollectionStatus,
    CollectionRunStatus,
    CollectionRunType,
    CollectionSchoolAction,
    DataSource,
    IdentifierType,
    KysMappingStatus,
)
from school_intel.domain.schemas import SchoolIdentifierInput
from school_intel.parsers.saras_parser import SarasParser
from school_intel.repositories.batch_collection_repository import BatchCollectionRepository
from school_intel.repositories.school_repository import CollectionRunRepository, SourceRecordRepository
from school_intel.services.collection_assessment_service import CollectionAssessmentService
from school_intel.services.collection_preview_service import CollectionPreviewService
from school_intel.services.collection_service import KysCollectionService
from school_intel.services.kys_bulk_import_service import extract_kys_listing_rows, row_to_kys_candidate
from school_intel.services.kys_mapping_resolver import KysMappingResolver
from school_intel.services.saras_enrichment_service import SarasEnrichmentService
from school_intel.services.school_identity_service import IdentityLookupInput, SchoolIdentityService
from school_intel.services.validation_service import ValidationService

logger = logging.getLogger("school_intel.batch_collection")


class BatchCollectionOrchestrator:
    def __init__(
        self,
        session: Session,
        collector: SarasCollector | None = None,
        *,
        saras_enricher: SarasEnrichmentService | None = None,
        kys_resolver: KysMappingResolver | None = None,
    ) -> None:
        self.session = session
        self.collector = collector or SarasCollector()
        self.parser = SarasParser()
        self.preview = CollectionPreviewService(session, collector=self.collector)
        self.identity = SchoolIdentityService(session)
        self.assessment = CollectionAssessmentService(session)
        self.run_repo = CollectionRunRepository(session)
        self.batch_repo = BatchCollectionRepository(session)
        self.source_repo = SourceRecordRepository(session)
        self._saras_enricher = saras_enricher
        self._kys_resolver = kys_resolver
        self._owns_collector = collector is None

    def close(self) -> None:
        self.preview.close()

    def create_run(self, payload: dict, requested_by: str | None = None) -> UUID:
        source = payload.get("source", DataSource.SARAS.value)
        if source == DataSource.KYS.value or payload.get("source_mode") == "kys":
            return self._create_kys_direct_run(payload, requested_by=requested_by)
        return self._create_saras_run(payload, requested_by=requested_by)

    def _create_saras_run(self, payload: dict, requested_by: str | None = None) -> UUID:
        preview = self.preview.preview(
            source=payload["source"],
            state_id=payload["state_id"],
            state_name=payload["state_name"],
            district_id=payload["district_id"],
            district_name=payload["district_name"],
            year_from=payload.get("year_from", "2018-19"),
            year_to=payload.get("year_to", "2025-26"),
            data_groups=payload.get("data_groups"),
        )

        school_limit = payload.get("school_limit")
        schools = preview["schools"]
        if school_limit not in (None, "all", "All"):
            schools = schools[: int(school_limit)]

        parameters = {
            **payload,
            **pipeline_metadata_for_source(DataSource.SARAS.value),
            "requested_by": requested_by,
            "preview_summary": {
                key: preview[key]
                for key in (
                    "schools_found",
                    "unique_schools",
                    "duplicates",
                    "malformed_records",
                    "existing_canonical_schools",
                    "existing_complete",
                    "existing_incomplete",
                    "new_schools",
                    "unresolved_matches",
                    "conflicts",
                )
            },
            "stage_progress": {
                "saras_discovery": {"complete": 0, "total": len(schools)},
                "identity_resolution": {"complete": 0, "total": len(schools)},
                "kys_mapping": {"complete": 0, "total": len(schools)},
                "historical_collection": {"complete": 0, "total": len(schools)},
                "validation": {"complete": 0, "total": len(schools)},
            },
            "options": payload.get("options", {}),
        }

        run = self.run_repo.create(
            run_type=CollectionRunType.BATCH.value,
            source=DataSource.SARAS.value,
            parameters=parameters,
        )
        self.batch_repo.set_total_count(run.id, len(schools))

        for index, school in enumerate(schools):
            self.batch_repo.create_run_school(
                collection_run_id=run.id,
                position=index,
                affiliation_number=school["affiliation_number"],
                school_name=school["school_name"],
                school_code=school.get("school_code"),
                district=school.get("district"),
                state=school.get("state"),
                saras_row=school,
                school_id=UUID(school["school_id"]) if school.get("school_id") else None,
                planned_action=school["planned_action"],
                identity_status=school["identity_status"],
                kys_mapping_status=school.get("kys_mapping_status", "pending"),
                collection_status=BatchSchoolCollectionStatus.DISCOVERED.value,
            )

        parameters["stage_progress"]["saras_discovery"]["complete"] = len(schools)
        run.parameters = parameters
        self.session.flush()
        return run.id

    def _create_kys_direct_run(self, payload: dict, requested_by: str | None = None) -> UUID:
        """Seed a batch run from pasted KYS Advance Search JSON (CAPTCHA already solved)."""
        raw = payload.get("kys_district_json")
        rows = extract_kys_listing_rows(raw)
        candidates = [c for c in (row_to_kys_candidate(r) for r in rows) if c is not None]
        if not candidates:
            raise ValueError("No school records found in kys_district_json")

        # Deduplicate by kys_school_id (first wins).
        seen: set[str] = set()
        unique: list = []
        for candidate in candidates:
            if candidate.kys_school_id in seen:
                continue
            seen.add(candidate.kys_school_id)
            unique.append(candidate)

        school_limit = payload.get("school_limit")
        schools = unique
        if school_limit not in (None, "all", "All"):
            schools = schools[: int(school_limit)]

        inferred_district = next((c.district for c in schools if c.district), None)
        inferred_state = next((c.state for c in schools if c.state), None)
        state_name = (payload.get("state_name") or "").strip() or inferred_state or ""
        district_name = (payload.get("district_name") or "").strip() or inferred_district or ""

        pipeline = pipeline_metadata_for_source(DataSource.KYS.value)
        parameters = {
            **payload,
            **pipeline,
            "source": DataSource.KYS.value,
            "source_mode": "kys",
            "state_id": payload.get("state_id") or "",
            "district_id": payload.get("district_id") or "",
            "state_name": state_name,
            "district_name": district_name,
            "requested_by": requested_by,
            # Drop the bulky JSON from stored parameters after seeding — keep a count only.
            "kys_district_json": None,
            "kys_schools_pasted": len(unique),
            "preview_summary": {
                "schools_found": len(rows),
                "unique_schools": len(unique),
                "duplicates": max(len(candidates) - len(unique), 0),
                "malformed_records": max(len(rows) - len(candidates), 0),
                "existing_canonical_schools": 0,
                "existing_complete": 0,
                "existing_incomplete": 0,
                "new_schools": len(schools),
                "unresolved_matches": 0,
                "conflicts": 0,
            },
            "stage_progress": {
                "kys_discovery": {"complete": 0, "total": len(schools)},
                "identity_resolution": {"complete": 0, "total": len(schools)},
                "historical_collection": {"complete": 0, "total": len(schools)},
                "validation": {"complete": 0, "total": len(schools)},
            },
            "options": payload.get("options", {}),
        }

        run = self.run_repo.create(
            run_type=CollectionRunType.BATCH.value,
            source=DataSource.KYS.value,
            parameters=parameters,
        )
        self.batch_repo.set_total_count(run.id, len(schools))

        for index, candidate in enumerate(schools):
            udise = candidate.udise or ""
            # affiliation_number is required on CollectionRunSchool; for KYS-only
            # we use UDISE (or a kys- synthetic key) as the stable row key.
            affiliation_key = udise or f"kys-{candidate.kys_school_id}"
            discovery_row = {
                **(candidate.raw or {}),
                "kys_school_id": candidate.kys_school_id,
                "udise": udise or None,
                "school_name": candidate.school_name,
                "district": candidate.district,
                "state": candidate.state,
                "pin_code": candidate.pin_code,
                "address_line": candidate.address_line,
                "discovery_source": DataSource.KYS.value,
            }
            self.batch_repo.create_run_school(
                collection_run_id=run.id,
                position=index,
                affiliation_number=affiliation_key,
                school_name=candidate.school_name or affiliation_key,
                school_code=None,
                district=candidate.district or district_name or None,
                state=candidate.state or state_name or None,
                saras_row=discovery_row,
                school_id=None,
                planned_action=CollectionSchoolAction.NEW.value,
                identity_status="new",
                kys_mapping_status="mapped",  # IDs came from the paste itself
                collection_status=BatchSchoolCollectionStatus.DISCOVERED.value,
            )

        parameters["stage_progress"]["kys_discovery"]["complete"] = len(schools)
        run.parameters = parameters
        flag_modified(run, "parameters")
        self.session.flush()
        return run.id

    def start_run_async(self, run_id: UUID) -> None:
        from school_intel.db.session import session_scope

        def _worker() -> None:
            with session_scope() as session:
                orchestrator = BatchCollectionOrchestrator(session)
                try:
                    orchestrator.execute_run(run_id)
                finally:
                    orchestrator.close()

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    def execute_run(self, run_id: UUID) -> None:
        run = self.run_repo.get(run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")

        if run.status == CollectionRunStatus.PAUSED.value:
            self.run_repo.mark_running(run_id)

        params = run.parameters or {}
        options = params.get("options", {})
        skip_complete = options.get("skip_complete", True)
        resume_incomplete = options.get("resume_incomplete", True)

        items = self.batch_repo.list_run_schools(run_id)
        failed = 0

        for item in items:
            run = self.run_repo.get(run_id)
            if run and run.status in {CollectionRunStatus.PAUSED.value, CollectionRunStatus.CANCELLED.value}:
                break

            normalized_status = normalize_school_status(item.collection_status)
            if is_terminal_success(normalized_status):
                continue

            if item.planned_action == CollectionSchoolAction.SKIP.value and skip_complete:
                self._mark_skipped(item, "Already complete for requested scope")
                continue

            if item.planned_action == CollectionSchoolAction.REVIEW.value:
                item.collection_status = BatchSchoolCollectionStatus.NEEDS_REVIEW.value
                self.batch_repo.update_run_school(item)
                continue

            if item.planned_action == CollectionSchoolAction.CONFLICT.value:
                item.collection_status = BatchSchoolCollectionStatus.CONFLICT.value
                self.batch_repo.update_run_school(item)
                continue

            try:
                self._process_school_item(item, run_id, params, resume_incomplete=resume_incomplete)
            except Exception as exc:
                logger.exception("batch_school_failed affiliation=%s", item.affiliation_number)
                item.collection_status = BatchSchoolCollectionStatus.FAILED.value
                item.error_summary = str(exc)
                item.completed_at = datetime.now(timezone.utc)
                self.batch_repo.update_run_school(item)
                failed += 1

            self._update_stage_progress(run_id, self.batch_repo.list_run_schools(run_id))
            self.run_repo.update_progress(
                run_id,
                processed_count=self._count_terminal_schools(run_id),
                failed_count=failed,
                cursor_value=str(item.position),
                status=CollectionRunStatus.RUNNING.value,
            )
            self.session.commit()

        final_items = self.batch_repo.list_run_schools(run_id)
        self._update_stage_progress(run_id, final_items)
        final_status = derive_run_status(
            [item.collection_status for item in final_items],
            current_status=run.status if run else CollectionRunStatus.RUNNING.value,
            paused=bool(run and run.status == CollectionRunStatus.PAUSED.value),
            cancelled=bool(run and run.status == CollectionRunStatus.CANCELLED.value),
        )
        self.run_repo.update_progress(
            run_id,
            processed_count=self._count_terminal_schools(run_id),
            failed_count=failed,
            status=final_status,
        )
        self.session.commit()

    def _count_terminal_schools(self, run_id: UUID) -> int:
        items = self.batch_repo.list_run_schools(run_id)
        return sum(1 for item in items if is_terminal_school_status(item.collection_status))

    def _process_school_item(
        self,
        item: CollectionRunSchool,
        run_id: UUID,
        params: dict,
        *,
        resume_incomplete: bool,
    ) -> None:
        if is_terminal_success(item.collection_status):
            return

        if not item.started_at:
            item.started_at = datetime.now(timezone.utc)

        if params.get("pipeline_type") == "kys_direct" or params.get("source") == DataSource.KYS.value:
            self._process_kys_direct_item(item, run_id, params, resume_incomplete=resume_incomplete)
            return

        if normalize_school_status(item.collection_status) not in {
            BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value,
            BatchSchoolCollectionStatus.KYS_MAPPING_REVIEW.value,
            BatchSchoolCollectionStatus.KYS_MAPPED.value,
            BatchSchoolCollectionStatus.PARTIAL.value,
            BatchSchoolCollectionStatus.IDENTITY_RESOLVED.value,
            BatchSchoolCollectionStatus.IDENTITY_CREATED.value,
            BatchSchoolCollectionStatus.COLLECTING.value,
        }:
            item.collection_status = BatchSchoolCollectionStatus.COLLECTING.value
            self.batch_repo.update_run_school(item)

        if not item.school_id:
            row = item.saras_row or {}
            resolution = self.identity.resolve(
                IdentityLookupInput(
                    canonical_name=item.school_name,
                    district=item.district,
                    state=item.state,
                    address_line=row.get("address_line"),
                    identifiers=[
                        SchoolIdentifierInput(
                            identifier_type=IdentifierType.CBSE_AFFILIATION,
                            identifier_value=item.affiliation_number,
                            source=DataSource.SARAS,
                            is_verified=True,
                        )
                    ],
                    source=DataSource.SARAS,
                    source_payload=row,
                ),
                create_if_missing=True,
            )
            if resolution.requires_manual_review or not resolution.school_id:
                item.collection_status = BatchSchoolCollectionStatus.NEEDS_REVIEW.value
                item.completed_at = datetime.now(timezone.utc)
                self.batch_repo.update_run_school(item)
                return

            item.school_id = resolution.school_id
            item.identity_status = (
                BatchSchoolCollectionStatus.IDENTITY_CREATED.value
                if resolution.created
                else BatchSchoolCollectionStatus.IDENTITY_RESOLVED.value
            )
            self.batch_repo.update_run_school(item)

        self._enrich_saras_detail(item)

        if item.kys_mapping_status != "mapped":
            mapping = self._resolve_kys_mapping(item.school_id)
            if mapping.status != KysMappingStatus.MAPPED:
                self._apply_kys_mapping_outcome(item, mapping)
                return

        kys_id, udise = self._resolve_kys_identifiers(item.school_id)
        if not kys_id:
            item.kys_mapping_status = "unresolved"
            item.collection_status = BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value
            item.error_summary = item.error_summary or "KYS school ID could not be resolved after mapping"
            item.completed_at = datetime.now(timezone.utc)
            self.batch_repo.update_run_school(item)
            return

        item.kys_mapping_status = "mapped"
        item.collection_status = BatchSchoolCollectionStatus.KYS_MAPPED.value
        years = years_in_range(params.get("year_from", "2018-19"), params.get("year_to", "2025-26"))
        item.years_total = len(years)
        if not item.year_progress:
            item.year_progress = {year: {"status": "pending"} for year in years}
        self.batch_repo.update_run_school(item)

        if item.school_id and self.assessment.is_school_complete(
            item.school_id,
            params.get("year_from", "2018-19"),
            params.get("year_to", "2025-26"),
            params.get("data_groups", []),
        ):
            self._mark_skipped(item, "Golden record already complete")
            return

        self._collect_historical_kys(item, run_id, params, kys_id=kys_id, udise=udise or "", years=years)

    def _process_kys_direct_item(
        self,
        item: CollectionRunSchool,
        run_id: UUID,
        params: dict,
        *,
        resume_incomplete: bool,
    ) -> None:
        """KYS-only path: paste already provided schoolId + UDISE; skip SARAS + mapping."""
        _ = resume_incomplete  # reserved for future per-endpoint resume parity
        row = item.saras_row or {}
        kys_id = str(row.get("kys_school_id") or row.get("schoolId") or "").strip()
        udise = str(row.get("udise") or row.get("udiseschCode") or "").strip()
        if not udise and item.affiliation_number and not item.affiliation_number.startswith("kys-"):
            udise = item.affiliation_number.strip()

        if not kys_id:
            item.collection_status = BatchSchoolCollectionStatus.FAILED.value
            item.error_summary = "KYS schoolId missing from discovery row"
            item.completed_at = datetime.now(timezone.utc)
            self.batch_repo.update_run_school(item)
            return
        if not udise:
            item.collection_status = BatchSchoolCollectionStatus.FAILED.value
            item.error_summary = "UDISE code missing from discovery row"
            item.completed_at = datetime.now(timezone.utc)
            self.batch_repo.update_run_school(item)
            return

        item.collection_status = BatchSchoolCollectionStatus.COLLECTING.value
        item.current_operation = "Resolving school identity from KYS"
        self.batch_repo.update_run_school(item)
        self.session.commit()

        collector = KysCollector()
        service = KysCollectionService(self.session, collector=collector)
        try:
            school, resolved_kys_id = service._resolve_school(
                udise=udise,
                kys_school_id=kys_id,
                state_school_code=None,
            )
        except Exception as exc:
            item.collection_status = BatchSchoolCollectionStatus.FAILED.value
            item.error_summary = f"KYS identity resolve failed: {exc}"
            item.completed_at = datetime.now(timezone.utc)
            self.batch_repo.update_run_school(item)
            return
        finally:
            collector.close()

        item.school_id = school.id
        item.identity_status = BatchSchoolCollectionStatus.IDENTITY_RESOLVED.value
        item.kys_mapping_status = "mapped"
        item.collection_status = BatchSchoolCollectionStatus.KYS_MAPPED.value
        years = years_in_range(params.get("year_from", "2018-19"), params.get("year_to", "2025-26"))
        item.years_total = len(years)
        if not item.year_progress:
            item.year_progress = {year: {"status": "pending"} for year in years}
        self.batch_repo.update_run_school(item)
        self.session.commit()

        if self.assessment.is_school_complete(
            item.school_id,
            params.get("year_from", "2018-19"),
            params.get("year_to", "2025-26"),
            params.get("data_groups", []),
        ):
            self._mark_skipped(item, "Golden record already complete")
            return

        self._collect_historical_kys(
            item,
            run_id,
            params,
            kys_id=resolved_kys_id,
            udise=udise,
            years=years,
        )

    def _enrich_saras_detail(self, item: CollectionRunSchool) -> None:
        enricher = self._saras_enricher or SarasEnrichmentService(self.session, collector=self.collector)
        try:
            enricher.enrich_run_school(item, live_fetch=True)
        finally:
            if self._saras_enricher is None and enricher is not None:
                enricher.close()

    def _resolve_kys_mapping(self, school_id: UUID):
        resolver = self._kys_resolver or KysMappingResolver(self.session)
        try:
            return resolver.resolve(school_id, persist=True)
        finally:
            if self._kys_resolver is None:
                resolver.close()

    def _apply_kys_mapping_outcome(self, item: CollectionRunSchool, mapping) -> None:
        if mapping.status == KysMappingStatus.REVIEW:
            item.collection_status = BatchSchoolCollectionStatus.KYS_MAPPING_REVIEW.value
            item.kys_mapping_status = "pending"
            item.error_summary = mapping.reason or "KYS mapping requires manual review"
        else:
            item.collection_status = BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value
            item.kys_mapping_status = "unresolved"
            item.error_summary = mapping.reason or "No high-confidence KYS mapping available"
        item.completed_at = datetime.now(timezone.utc)
        self.batch_repo.update_run_school(item)

    def _collect_historical_kys(
        self,
        item: CollectionRunSchool,
        run_id: UUID,
        params: dict,
        *,
        kys_id: str,
        udise: str,
        years: list[str],
    ) -> None:
        # Pass an explicit collector (not `collector=None`) so KysCollectionService
        # does not own it — otherwise `collect_school`'s per-call cleanup closes the
        # shared httpx.Client after the FIRST year, breaking every subsequent year
        # in this loop with "Cannot send a request, as the client has been closed."
        collector = KysCollector()
        service = KysCollectionService(self.session, collector=collector)
        state_code = self._state_school_code(item.school_id) or item.school_code
        item.collection_status = BatchSchoolCollectionStatus.COLLECTING.value
        item.error_summary = None
        self.batch_repo.update_run_school(item)
        try:
            for year in years:
                if item.year_progress and item.year_progress.get(year, {}).get("status") == "complete":
                    continue
                item.current_year = year
                item.current_operation = f"Collecting {year} intelligence"
                if item.year_progress:
                    item.year_progress[year] = {"status": "in_progress"}
                self.batch_repo.update_run_school(item)
                self.session.commit()

                service.collect_school(
                    udise=udise,
                    kys_school_id=kys_id,
                    state_school_code=state_code,
                    verbose=False,
                    target_years=[year],
                )
                if item.year_progress:
                    item.year_progress[year] = {"status": "complete"}
                item.years_complete = sum(
                    1 for y, progress in (item.year_progress or {}).items() if progress.get("status") == "complete"
                )
                self.batch_repo.update_run_school(item)
                self.session.commit()
        finally:
            collector.close()

        report = ValidationService().validate_school(
            self.session,
            item.school_id,
            collection_status="complete",
        )
        item.validation_status = report.validation_status.value
        item.collection_status = (
            BatchSchoolCollectionStatus.COMPLETE.value
            if report.collection_status and report.collection_status.value == "complete"
            else BatchSchoolCollectionStatus.PARTIAL.value
        )
        item.completed_at = datetime.now(timezone.utc)
        self.batch_repo.update_run_school(item)


    def _mark_skipped(self, item: CollectionRunSchool, reason: str) -> None:
        item.collection_status = BatchSchoolCollectionStatus.SKIPPED.value
        item.warning_summary = reason
        item.completed_at = datetime.now(timezone.utc)
        self.batch_repo.update_run_school(item)

    def _resolve_kys_identifiers(self, school_id: UUID) -> tuple[str | None, str | None]:
        school = self.identity.repo.get_by_id(school_id)
        if not school:
            return None, None
        kys_id = udise = None
        for ident in school.identifiers:
            if ident.identifier_type == IdentifierType.KYS_SCHOOL_ID.value:
                kys_id = ident.identifier_value
            if ident.identifier_type == IdentifierType.UDISE.value:
                udise = ident.identifier_value
        return kys_id, udise

    def _state_school_code(self, school_id: UUID) -> str | None:
        school = self.identity.repo.get_by_id(school_id)
        if not school:
            return None
        for ident in school.identifiers:
            if ident.identifier_type == IdentifierType.STATE_SCHOOL_CODE.value:
                return ident.identifier_value
        return None

    @staticmethod
    def compute_stage_progress(items: list[CollectionRunSchool], pipeline_type: str | None = None) -> dict[str, dict[str, int]]:
        return contract_compute_stage_progress(items, pipeline_type=pipeline_type)

    def _update_stage_progress(self, run_id: UUID, items: list[CollectionRunSchool]) -> None:
        run = self.run_repo.get(run_id)
        if not run or not run.parameters:
            return
        params = dict(run.parameters)
        params["stage_progress"] = contract_compute_stage_progress(
            items,
            pipeline_type=params.get("pipeline_type"),
        )
        run.parameters = params
        flag_modified(run, "parameters")
        self.session.flush()

    @staticmethod
    def build_run_summary_payload(run, items: list[CollectionRunSchool], status_counts: dict[str, int]) -> dict:
        progress = aggregate_run_progress(items, run)
        pipeline = pipeline_display_for_run(run)
        current = next(
            (item for item in items if item.collection_status == BatchSchoolCollectionStatus.COLLECTING.value),
            None,
        )
        return {
            "run_id": str(run.id),
            "status": run.status,
            "source": run.source,
            "pipeline": pipeline["pipeline"],
            "pipeline_description": pipeline["pipeline_description"],
            "discovery_source": pipeline["discovery_source"],
            "enrichment_sources": pipeline["enrichment_sources"],
            "pipeline_type": pipeline["pipeline_type"],
            "parameters": run.parameters,
            "total_count": progress["total_count"],
            "processed_count": progress["processed_count"],
            "failed_count": run.failed_count,
            "overall_percent": progress["overall_percent"],
            "status_counts": progress["status_counts"],
            "stage_progress": progress["stage_progress"],
            "current_school": BatchCollectionOrchestrator._serialize_current_school_static(current),
            "started_at": run.started_at,
            "completed_at": run.completed_at,
        }

    def get_run_summary(self, run_id: UUID) -> dict:
        run = self.run_repo.get(run_id)
        if not run:
            raise ValueError(f"Collection run not found: {run_id}")
        items = self.batch_repo.list_run_schools(run_id)
        status_counts = self.batch_repo.count_schools_by_status(run_id)
        return self.build_run_summary_payload(run, items, status_counts)

    @staticmethod
    def _serialize_current_school_static(item: CollectionRunSchool | None) -> dict | None:
        if not item:
            return None
        return {
            "school_name": item.school_name,
            "affiliation_number": item.affiliation_number,
            "school_id": str(item.school_id) if item.school_id else None,
            "identity_status": item.identity_status,
            "kys_mapping_status": item.kys_mapping_status,
            "current_year": item.current_year,
            "current_operation": item.current_operation,
            "years_total": item.years_total,
            "years_complete": item.years_complete,
            "year_progress": item.year_progress or {},
            "validation_status": item.validation_status,
            "collection_status": item.collection_status,
        }

    def _serialize_current_school(self, item: CollectionRunSchool | None) -> dict | None:
        return self._serialize_current_school_static(item)

    def list_run_schools(self, run_id: UUID) -> list[dict]:
        return [
            {
                "id": str(item.id),
                "position": item.position,
                "school_name": item.school_name,
                "affiliation_number": item.affiliation_number,
                "school_code": item.school_code,
                "district": item.district,
                "school_id": str(item.school_id) if item.school_id else None,
                "planned_action": item.planned_action,
                "identity_status": item.identity_status,
                "kys_mapping_status": item.kys_mapping_status,
                "collection_status": item.collection_status,
                "validation_status": item.validation_status,
                "error_summary": item.error_summary,
                "warning_summary": item.warning_summary,
            }
            for item in self.batch_repo.list_run_schools(run_id)
        ]
