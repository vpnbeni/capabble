"""Regression tests for SARAS + KYS unified collection pipeline semantics."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from school_intel.domain.collection_contract import (
    aggregate_run_progress,
    derive_run_status,
    is_terminal_success,
    normalize_school_status,
    pipeline_display_for_run,
    pipeline_metadata_for_source,
)
from school_intel.domain.enums import BatchSchoolCollectionStatus, CollectionRunStatus, DataSource
from school_intel.services.batch_collection_orchestrator import BatchCollectionOrchestrator


def _item(status: str, **kwargs):
    return SimpleNamespace(
        collection_status=status,
        school_id=kwargs.get("school_id"),
        identity_status=kwargs.get("identity_status", "new"),
        kys_mapping_status=kwargs.get("kys_mapping_status", "pending"),
        validation_status=kwargs.get("validation_status"),
        years_complete=kwargs.get("years_complete", 0),
        years_total=kwargs.get("years_total", 0),
    )


def _run(total: int = 5, processed: int = 0, status: str = "running", source: str = "saras"):
    return SimpleNamespace(
        id=uuid4(),
        total_count=total,
        processed_count=processed,
        failed_count=0,
        status=status,
        source=source,
        run_type="batch",
        parameters={"state_name": "HARYANA", "district_name": "ROHTAK"},
        started_at=None,
        completed_at=None,
    )


def test_saras_discovery_only_is_not_complete() -> None:
    items = [_item(BatchSchoolCollectionStatus.DISCOVERED.value)]
    assert not is_terminal_success(items[0].collection_status)


def test_saras_plus_identity_is_not_complete() -> None:
    items = [_item(BatchSchoolCollectionStatus.IDENTITY_RESOLVED.value, school_id=uuid4(), identity_status="identity_resolved")]
    assert not is_terminal_success(items[0].collection_status)


def test_saras_identity_kys_mapping_review_is_not_complete() -> None:
    items = [
        _item(
            BatchSchoolCollectionStatus.KYS_MAPPING_REVIEW.value,
            school_id=uuid4(),
            identity_status="identity_created",
            kys_mapping_status="pending",
        )
    ]
    assert not is_terminal_success(items[0].collection_status)


def test_saras_identity_kys_mapping_pending_is_not_complete() -> None:
    items = [
        _item(
            BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value,
            school_id=uuid4(),
            identity_status="identity_created",
            kys_mapping_status="unresolved",
        )
    ]
    assert not is_terminal_success(items[0].collection_status)


def test_partial_historical_is_not_complete() -> None:
    items = [
        _item(
            BatchSchoolCollectionStatus.PARTIAL.value,
            school_id=uuid4(),
            identity_status="identity_created",
            kys_mapping_status="mapped",
            years_complete=2,
            years_total=8,
        )
    ]
    assert not is_terminal_success(items[0].collection_status)


def test_full_pipeline_complete_is_terminal_success() -> None:
    items = [
        _item(
            BatchSchoolCollectionStatus.COMPLETE.value,
            school_id=uuid4(),
            identity_status="identity_created",
            kys_mapping_status="mapped",
            validation_status="valid",
            years_complete=8,
            years_total=8,
        )
    ]
    assert is_terminal_success(items[0].collection_status)


def test_kys_mapping_failure_maps_to_kys_pending() -> None:
    assert normalize_school_status(BatchSchoolCollectionStatus.UNRESOLVED.value) == BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value


def test_run_not_completed_when_kys_pending() -> None:
    statuses = [BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value] * 5
    assert derive_run_status(statuses, current_status=CollectionRunStatus.RUNNING.value) == CollectionRunStatus.PARTIAL.value


def test_run_completed_only_when_all_schools_complete() -> None:
    statuses = [BatchSchoolCollectionStatus.COMPLETE.value] * 5
    assert derive_run_status(statuses, current_status=CollectionRunStatus.RUNNING.value) == CollectionRunStatus.COMPLETED.value


def test_progress_for_kys_pending_run() -> None:
    run = _run(total=5, processed=5, status="partial")
    items = [
        _item(
            BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value,
            school_id=uuid4(),
            identity_status="identity_created",
            kys_mapping_status="unresolved",
        )
        for _ in range(5)
    ]
    progress = aggregate_run_progress(items, run)
    assert progress["status_counts"]["complete"] == 0
    assert progress["status_counts"]["kys_pending"] == 5
    assert progress["overall_percent"] == 0.0
    assert progress["stage_progress"]["identity_resolution"] == {"complete": 5, "total": 5}
    assert progress["stage_progress"]["kys_mapping"] == {"complete": 0, "total": 5}


def test_pipeline_display_for_saras_batch_run() -> None:
    run = _run()
    run.parameters = {**run.parameters, **pipeline_metadata_for_source(DataSource.SARAS.value)}
    display = pipeline_display_for_run(run)
    assert display["pipeline"] == "SARAS + KYS"
    assert display["discovery_source"] == "saras"
    assert display["enrichment_sources"] == ["kys"]


def test_pipeline_display_for_legacy_kys_run() -> None:
    run = SimpleNamespace(
        source=DataSource.KYS.value,
        run_type="school",
        parameters={},
    )
    display = pipeline_display_for_run(run)
    assert display["pipeline"] == "KYS"


def test_completed_run_summary_reports_terminal_success_only() -> None:
    run = _run(total=5, status=CollectionRunStatus.PARTIAL.value)
    run.parameters = {
        **run.parameters,
        **pipeline_metadata_for_source(DataSource.SARAS.value),
    }
    items = [
        SimpleNamespace(
            collection_status=BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value,
            school_id=uuid4(),
            identity_status=BatchSchoolCollectionStatus.IDENTITY_CREATED.value,
            kys_mapping_status="unresolved",
            validation_status=None,
            years_complete=0,
            years_total=0,
        )
        for _ in range(5)
    ]
    status_counts = {BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value: 5}
    summary = BatchCollectionOrchestrator.build_run_summary_payload(run, items, status_counts)
    assert summary["pipeline"] == "SARAS + KYS"
    assert summary["status"] == CollectionRunStatus.PARTIAL.value
    assert summary["overall_percent"] == 0.0
    assert summary["status_counts"]["complete"] == 0
    assert summary["status_counts"]["kys_pending"] == 5
    assert summary["stage_progress"]["saras_discovery"] == {"complete": 5, "total": 5}
    assert summary["stage_progress"]["identity_resolution"] == {"complete": 5, "total": 5}
