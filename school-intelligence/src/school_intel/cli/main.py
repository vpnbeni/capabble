from __future__ import annotations

import json

import typer
from sqlalchemy import select

from school_intel.db.models import School, SchoolEnrollment, SchoolIdentifier, SchoolStudentDistribution
from school_intel.db.session import session_scope
from school_intel.domain.enums import CollectionOutcomeStatus, DataQualityStatus
from school_intel.services.collection_service import KysCollectionService
from school_intel.services.validation_service import ValidationService

from .migrate import run_migrate

app = typer.Typer(help="Capabble School Intelligence CLI")


@app.command("migrate")
def migrate() -> None:
    """Run Alembic migrations to latest schema."""
    raise typer.Exit(code=run_migrate())


def _status_label(status: str) -> str:
    return status.replace("_", " ").upper()


def _print_collection_summary(summary, verbose: bool = False) -> None:
    typer.echo(f"School: {summary.canonical_name}")
    if summary.udise:
        typer.echo(f"UDISE: {summary.udise}")
    if summary.kys_school_id:
        typer.echo(f"KYS ID: {summary.kys_school_id}")
    typer.echo("")

    for year in summary.years:
        ok = year.success_count
        total = year.total_count
        skipped = sum(1 for ep in year.endpoints if ep.status == "skipped")
        satisfied = ok + skipped
        mark = "OK" if satisfied == total and total > 0 else "FAIL" if satisfied == 0 else "PARTIAL"
        typer.echo(f"{year.academic_year}  {mark} {satisfied}/{total}")
        if verbose:
            for ep in year.endpoints:
                typer.echo(f"  {ep.endpoint}: {ep.status}" + (f" ({ep.error})" if ep.error else ""))

    typer.echo("")
    typer.echo("Collection:")
    typer.echo(f"  Status: {_status_label(summary.collection_status)}")
    typer.echo("")
    typer.echo("Identity:")
    typer.echo(f"  Status: {_status_label(summary.identity_status)}")
    typer.echo("")
    typer.echo("Data Quality:")
    typer.echo(f"  Status: {_status_label(summary.data_quality_status)}")
    issue_count = summary.data_quality_issue_count or len(summary.validation_warnings)
    if issue_count:
        typer.echo(f"  Issues: {issue_count}")

    typer.echo("")
    typer.echo("Enrollment:")
    for year_label, total in summary.enrollment_checks.items():
        typer.echo(f"  {year_label} = {total}")

    flag3_warnings = [w for w in summary.validation_warnings if "getSocialData:3" in w]
    if flag3_warnings:
        typer.echo("")
        typer.echo("Flag 3:")
        for warning in flag3_warnings:
            typer.echo(f"  {warning} (warning)")

    typer.echo("")
    collection_complete = summary.collection_status == CollectionOutcomeStatus.COMPLETE.value
    data_quality_warning = summary.data_quality_status == DataQualityStatus.WARNING.value
    if collection_complete and data_quality_warning:
        typer.echo("Result: COMPLETE WITH WARNING")
    elif collection_complete:
        typer.echo("Result: COMPLETE")
    elif summary.collection_status == CollectionOutcomeStatus.PARTIAL.value:
        typer.echo("Result: PARTIAL")
    else:
        typer.echo(f"Result: {_status_label(summary.collection_status)}")


def _print_validation_report(report) -> None:
    typer.echo("Collection:")
    collection_status = report.collection_status.value if report.collection_status else "unknown"
    typer.echo(f"  Status: {_status_label(collection_status)}")
    typer.echo("")
    typer.echo("Identity:")
    typer.echo(f"  Status: {_status_label(report.identity_status.value)}")
    typer.echo("")
    typer.echo("Data Quality:")
    typer.echo(f"  Status: {_status_label(report.data_quality_status.value)}")
    if report.issues:
        typer.echo(f"  Issues: {len(report.issues)}")
        for issue in report.issues:
            suffix = " (warning)" if issue.severity == "warning" else ""
            typer.echo(f"    - {issue.message}{suffix}")
    typer.echo("")
    typer.echo(f"Legacy validation_status: {report.validation_status.value}")


@app.command("show-school")
def show_school(school_id: str = typer.Option(..., "--school-id")) -> None:
    from uuid import UUID

    with session_scope() as session:
        school = session.get(School, UUID(school_id))
        if not school:
            typer.echo(f"School not found: {school_id}")
            raise typer.Exit(code=1)

        identifiers = list(
            session.scalars(select(SchoolIdentifier).where(SchoolIdentifier.school_id == school.id)).all()
        )
        enrollments = list(
            session.scalars(select(SchoolEnrollment).where(SchoolEnrollment.school_id == school.id)).all()
        )
        payload = {
            "id": str(school.id),
            "canonical_name": school.canonical_name,
            "district": school.district,
            "state": school.state,
            "pin_code": school.pin_code,
            "validation_status": school.validation_status,
            "identifiers": [
                {"type": row.identifier_type, "value": row.identifier_value, "source": row.source}
                for row in identifiers
            ],
            "enrollment": [
                {
                    "year": row.academic_year,
                    "total": row.total_enrollment,
                    "rte": row.rte_count,
                    "source": row.source,
                }
                for row in enrollments
            ],
        }
        typer.echo(json.dumps(payload, indent=2))


@app.command("validate-school")
def validate_school(school_id: str = typer.Option(..., "--school-id")) -> None:
    from uuid import UUID

    with session_scope() as session:
        report = ValidationService().validate_school(session, UUID(school_id))
        _print_validation_report(report)


@app.command("collect-school")
def collect_school(
    udise: str = typer.Option(..., "--udise"),
    kys_school_id: str | None = typer.Option(None, "--kys-school-id"),
    state_school_code: str | None = typer.Option(None, "--state-school-code"),
    verbose: bool = typer.Option(False, "--verbose"),
) -> None:
    """Collect all discovered academic years for a school from live KYS."""
    with session_scope() as session:
        service = KysCollectionService(session)
        summary = service.collect_school(
            udise=udise,
            kys_school_id=kys_school_id,
            state_school_code=state_school_code,
            verbose=verbose,
        )
        _print_collection_summary(summary, verbose=verbose)


@app.command("collect-year")
def collect_year(
    udise: str = typer.Option(..., "--udise"),
    year: str = typer.Option(..., "--year"),
    kys_school_id: str | None = typer.Option(None, "--kys-school-id"),
    state_school_code: str | None = typer.Option(None, "--state-school-code"),
    verbose: bool = typer.Option(False, "--verbose"),
) -> None:
    """Collect one academic year (accepts 2020-21 or yearId like 7)."""
    with session_scope() as session:
        service = KysCollectionService(session)
        summary = service.collect_year(
            udise=udise,
            year=year,
            kys_school_id=kys_school_id,
            state_school_code=state_school_code,
            verbose=verbose,
        )
        _print_collection_summary(summary, verbose=verbose)


@app.command("collect-batch")
def collect_batch(limit: int = typer.Option(100, "--limit")) -> None:
    typer.echo(
        json.dumps(
            {
                "message": "Batch collection not enabled. Complete golden school validation first.",
                "limit": limit,
            },
            indent=2,
        )
    )
    raise typer.Exit(code=1)


def _print_saras_report(report) -> None:
    typer.echo("SARAS Quality Report")
    typer.echo(f"  Total fetched: {report.total_fetched}")
    typer.echo(f"  Successfully parsed: {report.successfully_parsed}")
    typer.echo(f"  Parse failures: {report.parse_failures}")
    typer.echo(f"  Deterministic matches: {report.deterministic_matches}")
    typer.echo(f"  Fuzzy matches: {report.fuzzy_matches}")
    typer.echo(f"  Manual review: {report.manual_review}")
    typer.echo(f"  No UDISE identifier: {report.no_udise}")
    typer.echo(f"  No matching evidence: {report.no_matching_evidence}")
    typer.echo(f"  Himalyan identity: {report.himalyan_identity}")


@app.command("saras-test")
def saras_test() -> None:
    """Fetch and parse a small live SARAS sample."""
    from school_intel.db.session import session_scope
    from school_intel.services.saras_collection_service import SarasCollectionService

    with session_scope() as session:
        service = SarasCollectionService(session)
        result = service.test_sample()
        typer.echo(json.dumps(result, indent=2))


@app.command("saras-collect")
def saras_collect(
    limit: int = typer.Option(100, "--limit"),
    resume: bool = typer.Option(False, "--resume"),
) -> None:
    """Collect SARAS directory records (controlled batch)."""
    from school_intel.services.saras_collection_service import SarasCollectionService

    with session_scope() as session:
        service = SarasCollectionService(session)
        report = service.collect(limit=limit, resume=resume)
        _print_saras_report(report)


@app.command("saras-show")
def saras_show(affiliation: str = typer.Option(..., "--affiliation")) -> None:
    from school_intel.services.saras_collection_service import SarasCollectionService

    with session_scope() as session:
        service = SarasCollectionService(session)
        result = service.show_affiliation(affiliation)
        if not result:
            typer.echo(json.dumps({"error": "not_found", "affiliation": affiliation}, indent=2))
            raise typer.Exit(code=1)
        typer.echo(json.dumps(result, indent=2))


@app.command("match-school")
def match_school(udise: str = typer.Option(..., "--udise")) -> None:
    from school_intel.services.school_identity_service import SchoolIdentityService

    with session_scope() as session:
        service = SchoolIdentityService(session)
        result = service.match_by_udise(udise)
        typer.echo(
            json.dumps(
                {
                    "school_id": str(result.school_id) if result.school_id else None,
                    "requires_manual_review": result.requires_manual_review,
                    "candidates": [c.model_dump(mode="json") for c in result.candidates],
                },
                indent=2,
            )
        )


@app.command("kys-map-test")
def kys_map_test(
    run_id: str = typer.Option(..., "--run-id"),
    enrich_saras: bool = typer.Option(False, "--enrich-saras", help="Fetch and persist full SARAS payloads first"),
    persist: bool = typer.Option(False, "--persist", help="Persist auto-mapped high-confidence results"),
) -> None:
    """Run KYS mapping resolver for all schools in a collection run."""
    from uuid import UUID

    from school_intel.collectors.kys_search_client import KysSearchClient
    from school_intel.repositories.batch_collection_repository import BatchCollectionRepository
    from school_intel.services.kys_mapping_resolver import KysMappingResolver
    from school_intel.services.saras_enrichment_service import SarasEnrichmentService

    parsed_run_id = UUID(run_id)
    with session_scope() as session:
        if enrich_saras:
            enricher = SarasEnrichmentService(session)
            try:
                enricher.enrich_run(parsed_run_id, live_fetch=True)
                session.commit()
            finally:
                enricher.close()

        batch_repo = BatchCollectionRepository(session)
        items = batch_repo.list_run_schools(parsed_run_id)
        search = KysSearchClient()
        availability = search.availability()
        search.close()

        typer.echo(f"KYS programmatic search: {'available' if availability.programmatic_search_available else 'unavailable'}")
        typer.echo(availability.reason)
        typer.echo("")
        typer.echo("School | CBSE | SARAS | Status | KYS ID | UDISE | Confidence | Method | Candidates | Reason")
        typer.echo("-" * 120)

        resolver = KysMappingResolver(session)
        try:
            for item in items:
                if not item.school_id:
                    typer.echo(
                        f"{item.school_name} | {item.affiliation_number} | {item.school_code or '-'} | "
                        "NO_IDENTITY | - | - | - | - | 0 | Canonical school missing"
                    )
                    continue
                result = resolver.resolve(item.school_id, persist=persist)
                saras_code = (item.saras_row or {}).get("saras_school_code") or item.school_code or "-"
                typer.echo(
                    f"{item.school_name} | {item.affiliation_number} | {saras_code} | "
                    f"{result.status.value} | {result.kys_school_id or '-'} | {result.udise or '-'} | "
                    f"{result.confidence.value if result.confidence else '-'} | "
                    f"{result.method.value if result.method else '-'} | {result.candidate_count} | {result.reason}"
                )
            if persist:
                session.commit()
        finally:
            resolver.close()


@app.command("saras-enrich-run")
def saras_enrich_run(
    run_id: str = typer.Option(..., "--run-id"),
) -> None:
    """Persist full SARAS directory/detail payloads for schools in a collection run."""
    from uuid import UUID

    from school_intel.services.saras_enrichment_service import SarasEnrichmentService

    with session_scope() as session:
        service = SarasEnrichmentService(session)
        try:
            report = service.enrich_run(UUID(run_id), live_fetch=True)
            session.commit()
            typer.echo(json.dumps(report, indent=2))
        finally:
            service.close()


@app.command("match-review")
def match_review(limit: int = typer.Option(50, "--limit")) -> None:
    from school_intel.repositories.saras_repository import MatchCandidateRepository

    with session_scope() as session:
        repo = MatchCandidateRepository(session)
        pending = repo.list_pending(limit=limit)
        typer.echo(
            json.dumps(
                [
                    {
                        "id": str(row.id),
                        "source": row.source,
                        "matching_method": row.matching_method,
                        "confidence_score": row.confidence_score,
                        "candidate_school_id": str(row.candidate_school_id),
                        "requires_manual_review": row.requires_manual_review,
                        "matched_fields": row.matched_fields,
                        "mismatch_fields": row.mismatch_fields,
                    }
                    for row in pending
                ],
                indent=2,
            )
        )


if __name__ == "__main__":
    app()
