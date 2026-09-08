from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from school_intel.db.models import School, SourceRecord
from school_intel.domain.collection_constants import endpoints_for_groups, years_in_range
from school_intel.domain.enums import CollectionOutcomeStatus, CollectionSchoolAction, DataSource


class CollectionAssessmentService:
    """Assess whether a canonical school satisfies a requested collection scope."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def assess_school(
        self,
        school_id: UUID,
        year_from: str,
        year_to: str,
        data_groups: list[str],
    ) -> dict:
        years = years_in_range(year_from, year_to)
        endpoints = endpoints_for_groups(data_groups)
        year_status: dict[str, dict] = {}
        missing_units = 0
        total_units = len(years) * len(endpoints)

        for year in years:
            year_endpoints = {}
            for endpoint in endpoints:
                exists = self.session.scalar(
                    select(func.count())
                    .select_from(SourceRecord)
                    .where(
                        SourceRecord.school_id == school_id,
                        SourceRecord.academic_year == year,
                        SourceRecord.endpoint == endpoint,
                        SourceRecord.source == DataSource.KYS.value,
                    )
                )
                complete = bool(exists)
                year_endpoints[endpoint] = complete
                if not complete:
                    missing_units += 1
            year_status[year] = {
                "complete": all(year_endpoints.values()) if year_endpoints else False,
                "endpoints": year_endpoints,
            }

        school = self.session.get(School, school_id)
        dq = (school.data_quality or {}) if school else {}
        collection_status = dq.get("collection_status")
        complete_years = sum(1 for status in year_status.values() if status["complete"])

        if missing_units == 0 and total_units > 0:
            action = CollectionSchoolAction.SKIP.value
            collection_state = "complete"
        elif complete_years > 0 or missing_units < total_units:
            action = CollectionSchoolAction.RESUME.value
            collection_state = "incomplete"
        else:
            action = CollectionSchoolAction.UPDATE.value
            collection_state = "incomplete"

        if collection_status == CollectionOutcomeStatus.COMPLETE.value and missing_units == 0:
            collection_state = "complete"
            action = CollectionSchoolAction.SKIP.value

        return {
            "school_id": str(school_id),
            "collection_state": collection_state,
            "planned_action": action,
            "years_total": len(years),
            "years_complete": complete_years,
            "missing_units": missing_units,
            "total_units": total_units,
            "year_status": year_status,
            "validation": dq,
        }

    def is_school_complete(
        self,
        school_id: UUID,
        year_from: str,
        year_to: str,
        data_groups: list[str],
    ) -> bool:
        result = self.assess_school(school_id, year_from, year_to, data_groups)
        return result["collection_state"] == "complete"
