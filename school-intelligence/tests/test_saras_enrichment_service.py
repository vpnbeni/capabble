"""Regression tests for SARAS enrichment address extraction."""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from school_intel.db.models import CollectionRun, CollectionRunSchool, SarasSchoolRecord, School, SourceRecord
from school_intel.domain.enums import CollectionRunType, DataSource
from school_intel.repositories.school_repository import SchoolRepository
from school_intel.services.kys_four_field_matcher import SarasMappingFields
from school_intel.services.saras_enrichment_service import SarasEnrichmentService

POSTAL_ADDRESS = "V&P.O. MADINA TEHSIL MEHAM, DISTT ROHTAK, HARYANA"


def _seed_source_record(
    pg_session,
    *,
    school_id,
    collection_run_id,
    suffix: str,
) -> UUID:
    record = SourceRecord(
        id=uuid4(),
        school_id=school_id,
        collection_run_id=collection_run_id,
        source=DataSource.SARAS.value,
        endpoint=f"directory:test:{suffix}",
        raw_payload={"html": "<test/>"},
        payload_checksum=f"checksum-{suffix}",
        idempotency_key=f"saras|test|{suffix}",
    )
    pg_session.add(record)
    pg_session.flush()
    return record.id


@pytest.fixture
def enrichment_item(pg_session) -> CollectionRunSchool:
    repo = SchoolRepository(pg_session)
    school = repo.create_school(
        canonical_name="ARYA SENIOR SECONDARY SCHOOL MADINA",
        district="ROHTAK",
        state="HARYANA",
    )
    run = CollectionRun(
        id=uuid4(),
        run_type=CollectionRunType.BATCH.value,
        source=DataSource.SARAS.value,
        status="running",
        parameters={},
    )
    pg_session.add(run)
    pg_session.flush()

    item = CollectionRunSchool(
        id=uuid4(),
        collection_run_id=run.id,
        position=0,
        affiliation_number="530656",
        school_name="ARYA SENIOR SECONDARY SCHOOL MADINA",
        district="ROHTAK",
        state="HARYANA",
        school_id=school.id,
        planned_action="new",
        identity_status="identity_created",
        kys_mapping_status="pending",
        collection_status="discovered",
        saras_row={},
    )
    pg_session.add(item)
    pg_session.flush()
    return item


def test_postal_address_populates_address_line(enrichment_item: CollectionRunSchool, pg_session) -> None:
    enrichment_item.saras_row = {
        "detail_fields": {
            "Postal Address": POSTAL_ADDRESS,
            "Pin Code": "124001",
        }
    }
    service = SarasEnrichmentService(pg_session, collector=MagicMock())
    service.enrich_run_school(enrichment_item, live_fetch=False)

    assert enrichment_item.saras_row["address_line"] == POSTAL_ADDRESS
    assert enrichment_item.saras_row["detail_fields"]["Postal Address"] == POSTAL_ADDRESS

    school = pg_session.get(School, enrichment_item.school_id)
    assert school is not None
    assert school.address_line == POSTAL_ADDRESS

    saras_record = pg_session.scalar(
        select(SarasSchoolRecord).where(SarasSchoolRecord.affiliation_number == "530656")
    )
    assert saras_record is not None
    assert saras_record.address_line == POSTAL_ADDRESS
    assert saras_record.detail_fields["Postal Address"] == POSTAL_ADDRESS

    mapping_fields = SarasMappingFields.from_school(school)
    assert mapping_fields.address_line == POSTAL_ADDRESS


def test_existing_address_not_overwritten_with_null(enrichment_item: CollectionRunSchool, pg_session) -> None:
    existing_address = "EXISTING VALID ADDRESS, ROHTAK"
    school = pg_session.get(School, enrichment_item.school_id)
    school.address_line = existing_address
    pg_session.flush()

    enrichment_item.saras_row = {
        "address_line": existing_address,
        "detail_fields": {},
    }
    service = SarasEnrichmentService(pg_session, collector=MagicMock())
    service.enrich_run_school(enrichment_item, live_fetch=False)

    assert enrichment_item.saras_row["address_line"] == existing_address
    assert school.address_line == existing_address


def test_address_from_detail_fields_prefers_postal_address() -> None:
    assert SarasEnrichmentService._address_from_detail_fields(
        {"Postal Address": POSTAL_ADDRESS, "Address": "SHORT"}
    ) == POSTAL_ADDRESS


def test_re_enrich_preserves_existing_saras_record_provenance(
    enrichment_item: CollectionRunSchool, pg_session
) -> None:
    source_id = _seed_source_record(
        pg_session,
        school_id=enrichment_item.school_id,
        collection_run_id=enrichment_item.collection_run_id,
        suffix="directory",
    )
    detail_source_id = _seed_source_record(
        pg_session,
        school_id=enrichment_item.school_id,
        collection_run_id=enrichment_item.collection_run_id,
        suffix="detail",
    )
    existing_record = SarasSchoolRecord(
        id=uuid4(),
        affiliation_number="530656",
        school_code="41866",
        school_name="ARYA SENIOR SECONDARY SCHOOL MADINA",
        normalized_name="ARYA SENIOR SECONDARY SCHOOL MADINA",
        state="HARYANA",
        district="ROHTAK",
        address_line=None,
        normalized_address=None,
        school_id=enrichment_item.school_id,
        source_record_id=source_id,
        detail_source_record_id=detail_source_id,
        detail_fields={"Postal Address": "OLD"},
        parser_version="1.0.0",
        requires_manual_review=False,
    )
    pg_session.add(existing_record)
    pg_session.flush()

    enrichment_item.saras_row = {
        "detail_fields": {
            "Postal Address": POSTAL_ADDRESS,
            "Pin Code": "124001",
        }
    }
    service = SarasEnrichmentService(pg_session, collector=MagicMock())
    service.enrich_run_school(enrichment_item, live_fetch=False)
    pg_session.flush()

    saras_record = pg_session.scalar(
        select(SarasSchoolRecord).where(SarasSchoolRecord.affiliation_number == "530656")
    )
    assert saras_record is not None
    assert saras_record.address_line == POSTAL_ADDRESS
    assert saras_record.normalized_address is not None
    assert saras_record.source_record_id == source_id
    assert saras_record.detail_source_record_id == detail_source_id
    assert saras_record.requires_manual_review is False
