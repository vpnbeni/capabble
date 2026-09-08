from __future__ import annotations

from sqlalchemy.orm import Session

from school_intel.collectors.saras_collector import SarasCollector
from school_intel.domain.enums import CollectionSchoolAction, DataSource, IdentifierType
from school_intel.domain.schemas import SchoolIdentifierInput
from school_intel.parsers.saras_parser import SarasParser
from school_intel.services.collection_assessment_service import CollectionAssessmentService
from school_intel.services.school_identity_service import IdentityLookupInput, SchoolIdentityService


class CollectionPreviewService:
    """Read-only SARAS discovery and SCHOL collection planning."""

    def __init__(self, session: Session, collector: SarasCollector | None = None) -> None:
        self.session = session
        self.collector = collector or SarasCollector()
        self.parser = SarasParser()
        self.identity = SchoolIdentityService(session)
        self.assessment = CollectionAssessmentService(session)
        self._owns_collector = collector is None

    def close(self) -> None:
        if self._owns_collector:
            self.collector.close()

    def preview(
        self,
        *,
        source: str,
        state_id: str,
        state_name: str,
        district_id: str,
        district_name: str,
        year_from: str = "2018-19",
        year_to: str = "2025-26",
        data_groups: list[str] | None = None,
    ) -> dict:
        if source != "saras":
            raise ValueError("Only CBSE SARAS preview is supported")

        data_groups = data_groups or [
            "enrollment",
            "grade_distribution",
            "student_categories",
            "age_distribution",
            "rte_ews",
            "staff",
            "facilities",
            "school_profile",
        ]

        fetch = self.collector.fetch_district_directory(state_id, district_id)
        if fetch.http_status != 200:
            raise RuntimeError(f"SARAS directory fetch failed: HTTP {fetch.http_status}")

        rows, parse_errors = self.parser.parse_directory_html(fetch.html)
        by_affiliation: dict[str, dict] = {}
        duplicates = 0
        malformed_records = len(parse_errors)

        for row in rows:
            key = row.affiliation_number.strip().upper()
            if key in by_affiliation:
                duplicates += 1
                continue
            by_affiliation[key] = row.model_dump()

        schools_preview = []
        counts = {
            "existing_canonical_schools": 0,
            "existing_complete": 0,
            "existing_incomplete": 0,
            "new_schools": 0,
            "unresolved_matches": 0,
            "conflicts": 0,
        }

        for row in by_affiliation.values():
            preview_row = self._preview_school_row(
                row,
                year_from=year_from,
                year_to=year_to,
                data_groups=data_groups,
            )
            schools_preview.append(preview_row)
            action = preview_row["planned_action"]
            if preview_row["school_id"]:
                counts["existing_canonical_schools"] += 1
            if action == CollectionSchoolAction.SKIP.value:
                counts["existing_complete"] += 1
            elif action in {CollectionSchoolAction.RESUME.value, CollectionSchoolAction.UPDATE.value}:
                counts["existing_incomplete"] += 1
            elif action == CollectionSchoolAction.NEW.value:
                counts["new_schools"] += 1
            elif action == CollectionSchoolAction.REVIEW.value:
                counts["unresolved_matches"] += 1
            elif action == CollectionSchoolAction.CONFLICT.value:
                counts["conflicts"] += 1

        schools_preview.sort(key=lambda item: item["school_name"])

        return {
            "source": source,
            "state": state_name,
            "state_id": state_id,
            "district": district_name,
            "district_id": district_id,
            "schools_found": len(rows),
            "unique_schools": len(by_affiliation),
            "duplicates": duplicates,
            "malformed_records": malformed_records,
            "year_from": year_from,
            "year_to": year_to,
            "data_groups": data_groups,
            **counts,
            "schools": schools_preview,
        }

    def _preview_school_row(
        self,
        row: dict,
        *,
        year_from: str,
        year_to: str,
        data_groups: list[str],
    ) -> dict:
        affiliation = row["affiliation_number"]
        resolution = self.identity.preview_match(
            IdentityLookupInput(
                canonical_name=row.get("school_name"),
                district=row.get("district") or None,
                state=row.get("state") or None,
                address_line=row.get("address_line"),
                identifiers=[
                    SchoolIdentifierInput(
                        identifier_type=IdentifierType.CBSE_AFFILIATION,
                        identifier_value=affiliation,
                        source=DataSource.SARAS,
                        is_verified=True,
                    )
                ],
                source=DataSource.SARAS,
                source_payload=row,
            ),
        )

        identity_status = "new"
        schol_identity = "NEW"
        collection_state = "new"
        planned_action = CollectionSchoolAction.NEW.value
        school_id = None

        if resolution.requires_manual_review:
            identity_status = "conflict" if len(resolution.candidates) > 1 else "unresolved"
            schol_identity = "CONFLICT" if len(resolution.candidates) > 1 else "UNRESOLVED"
            collection_state = "conflict" if len(resolution.candidates) > 1 else "unresolved"
            planned_action = (
                CollectionSchoolAction.CONFLICT.value
                if len(resolution.candidates) > 1
                else CollectionSchoolAction.REVIEW.value
            )
        elif resolution.school_id:
            school_id = str(resolution.school_id)
            identity_status = "verified"
            schol_identity = "VERIFIED"
            assessment = self.assessment.assess_school(
                resolution.school_id, year_from, year_to, data_groups
            )
            collection_state = assessment["collection_state"]
            planned_action = assessment["planned_action"]
            if collection_state == "complete":
                collection_state = "complete"
            else:
                collection_state = "incomplete"

        return {
            "school_name": row.get("school_name"),
            "affiliation_number": affiliation,
            "school_code": row.get("school_code"),
            "district": row.get("district"),
            "state": row.get("state"),
            "status": row.get("status"),
            "school_id": school_id,
            "identity_status": identity_status,
            "schol_identity": schol_identity,
            "collection_state": collection_state.upper() if collection_state else "NEW",
            "planned_action": planned_action,
            "kys_mapping_status": "mapped" if school_id and self._has_kys_id(resolution.school_id) else "pending",
        }

    def _has_kys_id(self, school_id) -> bool:
        from school_intel.repositories.school_repository import SchoolRepository

        repo = SchoolRepository(self.session)
        school = repo.get_by_id(school_id)
        if not school:
            return False
        return any(i.identifier_type == IdentifierType.KYS_SCHOOL_ID.value for i in school.identifiers)
