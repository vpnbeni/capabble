"""Single source of truth for SARAS + KYS collection pipeline semantics."""

from __future__ import annotations

from typing import Any

from school_intel.domain.collection_constants import endpoints_for_groups, years_in_range
from school_intel.domain.enums import (
    BatchSchoolCollectionStatus,
    CollectionRunStatus,
    DataSource,
)

# SARAS-driven user collection = full intelligence pipeline (discovery + enrichment).
CBSE_SCHOOL_INTELLIGENCE_PIPELINE = {
    "discovery_source": DataSource.SARAS.value,
    "enrichment_sources": [DataSource.KYS.value],
    "pipeline_type": "cbse_school_intelligence",
    "pipeline_label": "SARAS + KYS",
    "pipeline_description": "Discovery: SARAS · Intelligence: KYS/UDISE+",
}

TERMINAL_SUCCESS_STATUSES = frozenset(
    {
        BatchSchoolCollectionStatus.COMPLETE.value,
        BatchSchoolCollectionStatus.SKIPPED.value,
    }
)

TERMINAL_FAILURE_STATUSES = frozenset(
    {
        BatchSchoolCollectionStatus.FAILED.value,
        BatchSchoolCollectionStatus.CONFLICT.value,
    }
)

TERMINAL_REVIEW_STATUSES = frozenset(
    {
        BatchSchoolCollectionStatus.NEEDS_REVIEW.value,
        BatchSchoolCollectionStatus.KYS_MAPPING_REVIEW.value,
    }
)

TERMINAL_KYS_PENDING_STATUSES = frozenset(
    {
        BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value,
        BatchSchoolCollectionStatus.UNRESOLVED.value,  # legacy alias
    }
)

RESUMABLE_STATUSES = frozenset(
    {
        BatchSchoolCollectionStatus.DISCOVERED.value,
        BatchSchoolCollectionStatus.IDENTITY_RESOLVED.value,
        BatchSchoolCollectionStatus.IDENTITY_CREATED.value,
        BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value,
        BatchSchoolCollectionStatus.UNRESOLVED.value,
        BatchSchoolCollectionStatus.PARTIAL.value,
        BatchSchoolCollectionStatus.COLLECTING.value,
    }
)


def normalize_school_status(status: str | None) -> str:
    if status == BatchSchoolCollectionStatus.UNRESOLVED.value:
        return BatchSchoolCollectionStatus.KYS_MAPPING_PENDING.value
    return status or BatchSchoolCollectionStatus.DISCOVERED.value


def is_terminal_school_status(status: str | None) -> bool:
    normalized = normalize_school_status(status)
    return normalized in (
        TERMINAL_SUCCESS_STATUSES
        | TERMINAL_FAILURE_STATUSES
        | TERMINAL_REVIEW_STATUSES
        | TERMINAL_KYS_PENDING_STATUSES
        | {BatchSchoolCollectionStatus.PARTIAL.value}
    )


def is_terminal_success(status: str | None) -> bool:
    return normalize_school_status(status) in TERMINAL_SUCCESS_STATUSES


def is_kys_pending(status: str | None) -> bool:
    return normalize_school_status(status) in TERMINAL_KYS_PENDING_STATUSES


def pipeline_metadata_for_source(source: str) -> dict[str, Any]:
    if source == DataSource.SARAS.value:
        return CBSE_SCHOOL_INTELLIGENCE_PIPELINE.copy()
    if source == DataSource.KYS.value:
        return {
            "discovery_source": DataSource.KYS.value,
            "enrichment_sources": [DataSource.KYS.value],
            "pipeline_type": "kys_direct",
            "pipeline_label": "KYS",
            "pipeline_description": "Direct KYS/UDISE+ collection",
        }
    return {
        "discovery_source": source,
        "enrichment_sources": [],
        "pipeline_type": source,
        "pipeline_label": source.upper(),
        "pipeline_description": source.upper(),
    }


def pipeline_display_for_run(run) -> dict[str, str]:
    params = run.parameters or {}
    if params.get("pipeline_label"):
        return {
            "pipeline": params["pipeline_label"],
            "pipeline_description": params.get("pipeline_description", ""),
            "discovery_source": params.get("discovery_source", run.source),
            "enrichment_sources": params.get("enrichment_sources", []),
            "pipeline_type": params.get("pipeline_type", run.source),
        }
    if run.source == DataSource.SARAS.value and run.run_type == "batch":
        meta = CBSE_SCHOOL_INTELLIGENCE_PIPELINE
        return {
            "pipeline": meta["pipeline_label"],
            "pipeline_description": meta["pipeline_description"],
            "discovery_source": meta["discovery_source"],
            "enrichment_sources": meta["enrichment_sources"],
            "pipeline_type": meta["pipeline_type"],
        }
    if run.source == DataSource.KYS.value:
        return {
            "pipeline": "KYS",
            "pipeline_description": "Direct KYS/UDISE+ collection",
            "discovery_source": DataSource.KYS.value,
            "enrichment_sources": [DataSource.KYS.value],
            "pipeline_type": "kys_direct",
        }
    return {
        "pipeline": (run.source or "unknown").upper(),
        "pipeline_description": (run.source or "unknown").upper(),
        "discovery_source": run.source,
        "enrichment_sources": [],
        "pipeline_type": run.source,
    }


def derive_run_status(
    school_statuses: list[str],
    *,
    current_status: str,
    paused: bool = False,
    cancelled: bool = False,
) -> str:
    if cancelled:
        return CollectionRunStatus.CANCELLED.value
    if paused:
        return CollectionRunStatus.PAUSED.value
    if not school_statuses:
        return current_status

    normalized = [normalize_school_status(s) for s in school_statuses]
    if any(s == BatchSchoolCollectionStatus.COLLECTING.value for s in normalized):
        return CollectionRunStatus.RUNNING.value

    if all(is_terminal_success(s) for s in normalized):
        return CollectionRunStatus.COMPLETED.value

    if all(is_terminal_school_status(s) for s in normalized):
        return CollectionRunStatus.PARTIAL.value

    return CollectionRunStatus.RUNNING.value


def aggregate_run_progress(items: list[Any], run) -> dict[str, Any]:
    total = run.total_count or len(items)
    status_counts_raw: dict[str, int] = {}
    for item in items:
        key = normalize_school_status(getattr(item, "collection_status", None))
        status_counts_raw[key] = status_counts_raw.get(key, 0) + 1

    complete = sum(status_counts_raw.get(s, 0) for s in TERMINAL_SUCCESS_STATUSES)
    kys_pending = sum(status_counts_raw.get(s, 0) for s in TERMINAL_KYS_PENDING_STATUSES)
    terminal_processed = sum(1 for item in items if is_terminal_school_status(getattr(item, "collection_status", None)))

    return {
        "total_count": total,
        "processed_count": terminal_processed,
        "overall_percent": round((complete / total) * 100, 1) if total else 0,
        "status_counts": {
            "complete": complete,
            "remaining": max(total - terminal_processed, 0),
            "in_progress": status_counts_raw.get(BatchSchoolCollectionStatus.COLLECTING.value, 0),
            "partial": status_counts_raw.get(BatchSchoolCollectionStatus.PARTIAL.value, 0),
            "needs_review": status_counts_raw.get(BatchSchoolCollectionStatus.NEEDS_REVIEW.value, 0)
            + status_counts_raw.get(BatchSchoolCollectionStatus.KYS_MAPPING_REVIEW.value, 0),
            "kys_pending": kys_pending,
            "skipped": status_counts_raw.get(BatchSchoolCollectionStatus.SKIPPED.value, 0),
            "failed": status_counts_raw.get(BatchSchoolCollectionStatus.FAILED.value, 0),
            "unresolved": kys_pending,  # legacy alias for UI
            "conflict": status_counts_raw.get(BatchSchoolCollectionStatus.CONFLICT.value, 0),
            "collected": complete,
        },
        "stage_progress": compute_stage_progress(items),
    }


def compute_stage_progress(items: list[Any]) -> dict[str, dict[str, int]]:
    total = len(items)
    if total == 0:
        return {
            "saras_discovery": {"complete": 0, "total": 0},
            "identity_resolution": {"complete": 0, "total": 0},
            "kys_mapping": {"complete": 0, "total": 0},
            "historical_collection": {"complete": 0, "total": 0},
            "validation": {"complete": 0, "total": 0},
        }

    identity_complete = sum(
        1
        for item in items
        if getattr(item, "school_id", None)
        and getattr(item, "identity_status", "new")
        not in {"new", BatchSchoolCollectionStatus.DISCOVERED.value}
    )
    kys_mapped = sum(1 for item in items if getattr(item, "kys_mapping_status", None) == "mapped")
    historical_complete = sum(
        1
        for item in items
        if normalize_school_status(getattr(item, "collection_status", None))
        in {
            BatchSchoolCollectionStatus.COMPLETE.value,
            BatchSchoolCollectionStatus.SKIPPED.value,
            BatchSchoolCollectionStatus.PARTIAL.value,
        }
    )
    validation_complete = sum(1 for item in items if getattr(item, "validation_status", None))

    return {
        "saras_discovery": {"complete": total, "total": total},
        "identity_resolution": {"complete": identity_complete, "total": total},
        "kys_mapping": {"complete": kys_mapped, "total": total},
        "historical_collection": {"complete": historical_complete, "total": total},
        "validation": {"complete": validation_complete, "total": total},
    }


def school_satisfies_contract(
    *,
    collection_status: str,
    validation_status: str | None,
    kys_mapping_status: str | None,
    years_complete: int,
    years_total: int,
) -> bool:
    normalized = normalize_school_status(collection_status)
    if normalized not in TERMINAL_SUCCESS_STATUSES:
        return False
    if kys_mapping_status != "mapped":
        return False
    if years_total > 0 and years_complete < years_total:
        return False
    return validation_status is not None


def required_contract_scope(parameters: dict[str, Any]) -> dict[str, Any]:
    year_from = parameters.get("year_from", "2018-19")
    year_to = parameters.get("year_to", "2025-26")
    data_groups = parameters.get("data_groups") or []
    return {
        "years": years_in_range(year_from, year_to),
        "endpoints": endpoints_for_groups(data_groups),
        "data_groups": data_groups,
    }
