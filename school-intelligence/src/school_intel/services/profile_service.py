from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from school_intel.db.models import (
    School,
    SchoolAffiliation,
    SchoolContact,
    SchoolEnrollment,
    SchoolFacility,
    SchoolIdentifier,
    SchoolStudentDistribution,
    SchoolStudentIndicators,
    SchoolTeacherYear,
    SchoolYearSnapshot,
    SourceRecord,
)
from school_intel.domain.enums import DataSource, IdentifierType, ValidationStatus
from school_intel.services.profile_metrics import compute_enrollment_trends, students_per_teacher

ACADEMIC_YEAR_ORDER = [
    "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26",
]

GRADE_KEYS = [
    ("PP", ["pptB", "pptG"]),
    ("I", ["c1B", "c1G"]),
    ("II", ["c2B", "c2G"]),
    ("III", ["c3B", "c3G"]),
    ("IV", ["c4B", "c4G"]),
    ("V", ["c5B", "c5G"]),
    ("VI", ["c6B", "c6G"]),
    ("VII", ["c7B", "c7G"]),
    ("VIII", ["c8B", "c8G"]),
    ("IX", ["c9B", "c9G"]),
    ("X", ["c10B", "c10G"]),
]


class ProfileService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_school(self, school_id: UUID) -> School | None:
        stmt = (
            select(School)
            .where(School.id == school_id)
            .options(selectinload(School.identifiers))
        )
        return self.session.scalar(stmt)

    def build_profile(self, school_id: UUID, selected_year: str | None = None) -> dict:
        school = self.get_school(school_id)
        if not school:
            raise ValueError("School not found")

        enrollments = self._enrollments(school_id)
        teachers = self._teachers(school_id)
        indicators = self._indicators(school_id)
        distributions = self._distributions(school_id)
        facilities = self._facilities(school_id)
        contacts = self._contacts(school_id)
        affiliations = self._affiliations(school_id)
        snapshots = self._snapshots(school_id)

        enrollment_series = self._ordered_series(
            ACADEMIC_YEAR_ORDER, {e.academic_year: e.total_enrollment for e in enrollments}
        )
        trend = compute_enrollment_trends(enrollment_series)

        gender_by_year = {
            row.academic_year: row.indicator_value
            for row in indicators
            if row.indicator_key == "gender_totals"
        }
        rte_by_year = {
            row.academic_year: (row.indicator_value or {}).get("rte")
            for row in indicators
            if row.indicator_key == "rte_count"
        }
        ews_by_year = {
            row.academic_year: (row.indicator_value or {}).get("ews")
            for row in indicators
            if row.indicator_key == "ews_count"
        }

        teacher_series = self._ordered_series(
            ACADEMIC_YEAR_ORDER, {t.academic_year: t.teacher_count for t in teachers}
        )
        str_series = []
        for year, total in enrollment_series:
            tcount = next((t.teacher_count for t in teachers if t.academic_year == year), None)
            str_series.append({"year": year, "ratio": students_per_teacher(total, tcount)})

        data_quality_issues = self._data_quality_issues(distributions, enrollments)
        identifiers = self._identifier_map(school.identifiers)

        latest_year = selected_year or (ACADEMIC_YEAR_ORDER[-1] if ACADEMIC_YEAR_ORDER else None)
        latest_enrollment = next((e for e in enrollments if e.academic_year == latest_year), None)
        latest_teacher = next((t for t in teachers if t.academic_year == latest_year), None)

        profile_meta = self._profile_meta_for_year(school_id, latest_year)

        return {
            "school_id": str(school.id),
            "header": {
                "name": school.canonical_name,
                "location": self._location_label(school),
                "status": profile_meta.get("status", "Operational"),
                "school_type": profile_meta.get("school_type", "Co-educational"),
                "management": profile_meta.get("management", "Private Unaided"),
                "board": profile_meta.get("board", "State Board"),
                "identifiers": {
                    "udise": identifiers.get(IdentifierType.UDISE.value),
                    "state_school_code": identifiers.get(IdentifierType.STATE_SCHOOL_CODE.value),
                    "kys_school_id": identifiers.get(IdentifierType.KYS_SCHOOL_ID.value),
                    "cbse_affiliation": identifiers.get(IdentifierType.CBSE_AFFILIATION.value),
                },
                "established": profile_meta.get("established"),
                "classes": profile_meta.get("classes", "1-10"),
            },
            "overview": {
                "selected_year": latest_year,
                "students": latest_enrollment.total_enrollment if latest_enrollment else None,
                "teachers": latest_teacher.teacher_count if latest_teacher else None,
                "student_teacher_ratio": students_per_teacher(
                    latest_enrollment.total_enrollment if latest_enrollment else None,
                    latest_teacher.teacher_count if latest_teacher else None,
                ),
                "enrollment_trend": {
                    "from": trend.starting_enrollment,
                    "to": trend.latest_enrollment,
                    "absolute_change": trend.absolute_change,
                    "percentage_change": trend.percentage_change,
                    "consecutive_declines": trend.consecutive_declines,
                    "years": trend.years,
                    "totals": trend.totals,
                },
            },
            "enrollment": {
                "series": [
                    {
                        "year": year,
                        "total": total,
                        "boys": (gender_by_year.get(year) or {}).get("boys"),
                        "girls": (gender_by_year.get(year) or {}).get("girls"),
                        "rte": rte_by_year.get(year),
                        "ews": ews_by_year.get(year),
                    }
                    for year, total in enrollment_series
                ],
                "trend": {
                    "absolute_change": trend.absolute_change,
                    "percentage_change": trend.percentage_change,
                    "consecutive_declines": trend.consecutive_declines,
                },
            },
            "staff": {
                "series": [
                    {
                        "year": t.academic_year,
                        "total": t.teacher_count,
                        "details": t.details or {},
                    }
                    for t in sorted(teachers, key=lambda x: ACADEMIC_YEAR_ORDER.index(x.academic_year)
                                    if x.academic_year in ACADEMIC_YEAR_ORDER else 99)
                ],
                "student_teacher_ratio_series": str_series,
            },
            "students": {
                "distributions": [
                    {
                        "year": d.academic_year,
                        "type": d.distribution_type,
                        "reported_total": d.reported_total,
                        "validation_status": d.validation_status,
                        "data_quality": d.data_quality,
                    }
                    for d in distributions
                ],
            },
            "facilities": self._facility_summary(facilities, latest_year),
            "facility_history": self._facility_history(facilities),
            "contacts": [
                {
                    "type": c.contact_type,
                    "value": c.contact_value,
                    "label": c.label,
                }
                for c in contacts
            ],
            "affiliations": [
                {
                    "type": a.affiliation_type,
                    "number": a.affiliation_number,
                    "status": a.status,
                }
                for a in affiliations
            ],
            "sources": self._source_provenance(school_id, snapshots),
            "data_quality": data_quality_issues,
            "intelligence": self._intelligence_signals(trend, teacher_series, str_series),
        }

    def get_year_detail(self, school_id: UUID, academic_year: str) -> dict:
        enrollment = self.session.scalar(
            select(SchoolEnrollment).where(
                SchoolEnrollment.school_id == school_id,
                SchoolEnrollment.academic_year == academic_year,
                SchoolEnrollment.source == DataSource.KYS.value,
            )
        )
        social = self._parse_social_from_sources(school_id, academic_year)
        return {
            "academic_year": academic_year,
            "enrollment": {
                "total": enrollment.total_enrollment if enrollment else None,
                "rte": enrollment.rte_count if enrollment else None,
            },
            "gender": social.get("gender"),
            "social_categories": social.get("social_categories"),
            "indicators": social.get("indicators"),
            "grades": social.get("grades"),
        }

    def get_raw_sources(self, school_id: UUID, role: str) -> dict:
        if role not in {"admin", "analyst"}:
            raise PermissionError("Unauthorized for raw data access")
        records = list(
            self.session.scalars(
                select(SourceRecord).where(
                    SourceRecord.school_id == school_id,
                ).order_by(SourceRecord.academic_year, SourceRecord.endpoint)
            ).all()
        )
        return {
            "school_id": str(school_id),
            "records": [
                {
                    "id": str(r.id),
                    "source": r.source,
                    "endpoint": r.endpoint,
                    "academic_year": r.academic_year,
                    "http_status": r.http_status,
                    "fetched_at": r.fetched_at.isoformat() if r.fetched_at else None,
                    "raw_payload": r.raw_payload,
                }
                for r in records
            ],
        }

    def _enrollments(self, school_id: UUID) -> list[SchoolEnrollment]:
        return list(
            self.session.scalars(
                select(SchoolEnrollment).where(
                    SchoolEnrollment.school_id == school_id,
                    SchoolEnrollment.source == DataSource.KYS.value,
                )
            ).all()
        )

    def _teachers(self, school_id: UUID) -> list[SchoolTeacherYear]:
        return list(
            self.session.scalars(
                select(SchoolTeacherYear).where(
                    SchoolTeacherYear.school_id == school_id,
                    SchoolTeacherYear.source == DataSource.KYS.value,
                )
            ).all()
        )

    def _indicators(self, school_id: UUID) -> list[SchoolStudentIndicators]:
        return list(
            self.session.scalars(
                select(SchoolStudentIndicators).where(
                    SchoolStudentIndicators.school_id == school_id,
                )
            ).all()
        )

    def _distributions(self, school_id: UUID) -> list[SchoolStudentDistribution]:
        return list(
            self.session.scalars(
                select(SchoolStudentDistribution).where(
                    SchoolStudentDistribution.school_id == school_id,
                )
            ).all()
        )

    def _facilities(self, school_id: UUID) -> list[SchoolFacility]:
        return list(
            self.session.scalars(
                select(SchoolFacility).where(SchoolFacility.school_id == school_id)
            ).all()
        )

    def _contacts(self, school_id: UUID) -> list[SchoolContact]:
        return list(
            self.session.scalars(select(SchoolContact).where(SchoolContact.school_id == school_id)).all()
        )

    def _affiliations(self, school_id: UUID) -> list[SchoolAffiliation]:
        return list(
            self.session.scalars(select(SchoolAffiliation).where(SchoolAffiliation.school_id == school_id)).all()
        )

    def _snapshots(self, school_id: UUID) -> list[SchoolYearSnapshot]:
        return list(
            self.session.scalars(
                select(SchoolYearSnapshot).where(SchoolYearSnapshot.school_id == school_id)
            ).all()
        )

    def _identifier_map(self, identifiers: list[SchoolIdentifier]) -> dict[str, str | None]:
        out: dict[str, str | None] = {}
        for ident in identifiers:
            out[ident.identifier_type] = ident.identifier_value
        return out

    def _location_label(self, school: School) -> str:
        parts = [p for p in [school.district, school.state] if p]
        return ", ".join(parts) if parts else "Not available"

    def _ordered_series(self, order: list[str], data: dict[str, int | None]) -> list[tuple[str, int | None]]:
        return [(year, data.get(year)) for year in order]

    def _data_quality_issues(
        self,
        distributions: list[SchoolStudentDistribution],
        enrollments: list[SchoolEnrollment],
    ) -> list[dict]:
        issues = []
        enroll_map = {e.academic_year: e.total_enrollment for e in enrollments}
        for dist in distributions:
            if dist.distribution_type != "getSocialData:3":
                continue
            if dist.validation_status == ValidationStatus.NON_RECONCILING.value:
                annual = enroll_map.get(dist.academic_year)
                issues.append({
                    "code": "non_reconciling_age_distribution",
                    "year": dist.academic_year,
                    "message": "Age distribution does not reconcile with annual enrollment",
                    "reported_enrollment": annual,
                    "distribution_total": dist.reported_total,
                    "difference": (annual - dist.reported_total)
                    if annual is not None and dist.reported_total is not None
                    else None,
                    "severity": "warning",
                })
        return issues

    def _facility_summary(self, facilities: list[SchoolFacility], year: str | None) -> list[dict]:
        keys_of_interest = {
            "libraryYn", "playgroundYn", "toiletYn", "drinkWaterYn", "electricityYn",
            "internetYn", "ictLabYn", "rampsYn", "handrailsYn", "rainHarvestYn",
            "clsrmsInst", "desktopFun", "laptopFun",
        }
        result = []
        for fac in facilities:
            if year and fac.academic_year != year:
                continue
            if fac.facility_key not in keys_of_interest:
                continue
            val = fac.facility_value or {}
            raw = val.get("raw")
            result.append({
                "key": fac.facility_key,
                "label": self._facility_label(fac.facility_key),
                "value": raw,
                "year": fac.academic_year,
            })
        return result

    def _facility_history(self, facilities: list[SchoolFacility]) -> dict[str, list[dict]]:
        history: dict[str, list[dict]] = {}
        for fac in facilities:
            label = self._facility_label(fac.facility_key)
            history.setdefault(label, []).append({
                "year": fac.academic_year,
                "value": self._normalize_facility_value(fac.facility_value),
            })
        for label in history:
            history[label].sort(
                key=lambda x: ACADEMIC_YEAR_ORDER.index(x["year"])
                if x["year"] in ACADEMIC_YEAR_ORDER else 99
            )
        return history

    def _facility_label(self, key: str) -> str:
        mapping = {
            "libraryYn": "Library",
            "playgroundYn": "Playground",
            "toiletYn": "Toilets",
            "drinkWaterYn": "Drinking Water",
            "electricityYn": "Electricity",
            "internetYn": "Internet",
            "ictLabYn": "ICT Lab",
            "rampsYn": "Ramps",
            "handrailsYn": "Handrails",
            "rainHarvestYn": "Rainwater Harvesting",
            "clsrmsInst": "Classrooms",
        }
        return mapping.get(key, key)

    def _normalize_facility_value(self, value: dict | None) -> str:
        if not value:
            return "Not reported"
        raw = value.get("raw")
        if raw is None:
            return "Not reported"
        if isinstance(raw, str):
            if raw.strip().upper() in {"NA", "N/A", ""}:
                return "NA"
            if "1-Yes" in raw or raw == 1 or raw == "1":
                return "Yes"
            if "2-No" in raw or raw == 2 or raw == "2":
                return "No"
            return str(raw)
        if raw == 1:
            return "Yes"
        if raw == 2:
            return "No"
        if raw == 0:
            return "No"
        return str(raw)

    def _source_provenance(self, school_id: UUID, snapshots: list[SchoolYearSnapshot]) -> dict:
        years_status = []
        for year in ACADEMIC_YEAR_ORDER:
            snap = next((s for s in snapshots if s.academic_year == year), None)
            years_status.append({
                "year": year,
                "kys_collected": snap is not None,
                "validation_status": snap.validation_status if snap else None,
            })
        saras = self.session.scalar(
            select(SchoolAffiliation).where(SchoolAffiliation.school_id == school_id)
        )
        return {
            "kys": {"years": years_status},
            "saras": {
                "status": "found" if saras else "not_found",
                "message": "No matching SARAS record found" if not saras else "Record linked",
            },
        }

    def _intelligence_signals(
        self,
        trend,
        teacher_series: list[tuple[str, int | None]],
        str_series: list[dict],
    ) -> dict:
        signals = []
        if trend.percentage_change is not None and trend.percentage_change < 0:
            signals.append({
                "type": "derived_metric",
                "label": "Enrollment decline",
                "value": f"{abs(trend.percentage_change)}% over {len([t for t in trend.totals if t is not None]) - 1} years",
                "detail": f"{trend.starting_enrollment} → {trend.latest_enrollment}",
            })
        if trend.consecutive_declines > 0:
            signals.append({
                "type": "derived_metric",
                "label": "Consecutive annual declines",
                "value": str(trend.consecutive_declines),
            })
        if trend.starting_enrollment and trend.latest_enrollment and teacher_series:
            start_teachers = next((t[1] for t in teacher_series if t[1] is not None), None)
            end_teachers = next((t[1] for t in reversed(teacher_series) if t[1] is not None), None)
            if start_teachers and end_teachers:
                if trend.latest_enrollment < trend.starting_enrollment and end_teachers >= start_teachers:
                    signals.append({
                        "type": "intelligence_signal",
                        "label": "Enrollment vs teacher headcount",
                        "value": "Enrollment declined while teacher headcount remained stable or increased",
                    })
        if str_series:
            first_ratio = next((s["ratio"] for s in str_series if s["ratio"] is not None), None)
            last_ratio = next((s["ratio"] for s in reversed(str_series) if s["ratio"] is not None), None)
            if first_ratio and last_ratio and first_ratio != last_ratio:
                signals.append({
                    "type": "derived_metric",
                    "label": "Student/teacher ratio change",
                    "value": f"{first_ratio} → {last_ratio}",
                })

        investigation_areas = [
            "Enrollment retention",
            "Local competition",
            "Parent acquisition",
            "School positioning",
            "Academic outcomes",
            "Fee/value positioning",
        ]
        return {"signals": signals, "investigation_areas": investigation_areas}

    def _profile_meta_for_year(self, school_id: UUID, year: str | None) -> dict:
        if not year:
            return {}
        record = self.session.scalar(
            select(SourceRecord).where(
                SourceRecord.school_id == school_id,
                SourceRecord.academic_year == year,
                SourceRecord.endpoint == "profile",
            )
        )
        report = self.session.scalar(
            select(SourceRecord).where(
                SourceRecord.school_id == school_id,
                SourceRecord.academic_year == year,
                SourceRecord.endpoint == "report-card",
            )
        )
        meta: dict = {}
        if report and isinstance(report.raw_payload.get("data"), dict):
            data = report.raw_payload["data"]
            meta["status"] = data.get("schStatusName") or "Operational"
            meta["school_type"] = (data.get("schTypeDesc") or "").replace("3-", "") or "Co-educational"
            mgmt = data.get("schMgmtStateDesc") or data.get("schMgmtNationalDesc")
            if mgmt:
                meta["management"] = mgmt
            low, high = data.get("lowClass"), data.get("highClass")
            if low is not None and high is not None:
                meta["classes"] = f"{low}-{high}"
            board = data.get("boardSecName") or data.get("boardHighSecName")
            if board and "NA" not in str(board).upper():
                meta["board"] = str(board).split("-", 1)[-1].strip() if "-" in str(board) else board
            else:
                meta["board"] = "State Board"
        if record and isinstance(record.raw_payload.get("data"), dict):
            data = record.raw_payload["data"]
            meta["established"] = data.get("estdYear")
            if data.get("boardSecName"):
                b = str(data["boardSecName"])
                if "NA" not in b.upper():
                    meta["board"] = b.split("-", 1)[-1].strip() if "-" in b else b
        return meta

    def _parse_social_from_sources(self, school_id: UUID, academic_year: str) -> dict:
        result: dict = {}
        flag1 = self._source_payload(school_id, academic_year, "getSocialData:1")
        if flag1:
            data = flag1.get("data", {})
            total = data.get("schEnrollmentYearDataTotal", {})
            result["gender"] = {
                "boys": total.get("rowBoyTotal"),
                "girls": total.get("rowGirlTotal"),
            }
            categories = {}
            for row in data.get("schEnrollmentYearDataDTOS", []) or []:
                name = (row.get("enrollmentName") or "").strip()
                if name:
                    categories[name] = row.get("rowTotal")
            result["social_categories"] = categories
            grades = {}
            for label, keys in GRADE_KEYS:
                boys = sum(row.get(keys[0]) or 0 for row in data.get("schEnrollmentYearDataDTOS", []) or [])
                girls = sum(row.get(keys[1]) or 0 for row in data.get("schEnrollmentYearDataDTOS", []) or [])
                if boys or girls:
                    grades[label] = {"boys": boys, "girls": girls, "total": boys + girls}
            result["grades"] = grades

        flag4 = self._source_payload(school_id, academic_year, "getSocialData:4")
        flag5 = self._source_payload(school_id, academic_year, "getSocialData:5")
        indicators = {}
        if flag4:
            total = flag4.get("data", {}).get("schEnrollmentYearDataTotal", {})
            indicators["ews"] = total.get("finalTotal")
        if flag5:
            total = flag5.get("data", {}).get("schEnrollmentYearDataTotal", {})
            indicators["rte"] = total.get("finalTotal")
        result["indicators"] = indicators
        return result

    def _source_payload(self, school_id: UUID, year: str, endpoint: str) -> dict | None:
        record = self.session.scalar(
            select(SourceRecord).where(
                SourceRecord.school_id == school_id,
                SourceRecord.academic_year == year,
                SourceRecord.endpoint == endpoint,
            )
        )
        return record.raw_payload if record else None
