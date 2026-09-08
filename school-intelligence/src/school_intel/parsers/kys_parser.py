from __future__ import annotations

from typing import Any

from school_intel.domain.enums import DataSource, ValidationStatus
from school_intel.domain.schemas import EnrollmentNormalized, KysSchoolIdentity, StudentDistributionNormalized
from school_intel.utils.text import coerce_optional_int, first_present, normalize_identifier, title_case_location


class KysParser:
    """Normalize KYS payloads while preserving null semantics and provenance."""

    def _api_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = payload.get("data")
        return data if isinstance(data, dict) else payload

    def _social_total(self, data: dict[str, Any]) -> dict[str, Any]:
        total = data.get("schEnrollmentYearDataTotal")
        return total if isinstance(total, dict) else {}

    def parse_enrollment_from_social_flag1(
        self, payload: dict[str, Any], academic_year: str
    ) -> EnrollmentNormalized:
        """Flag=1 carries social-category enrollment; totals are authoritative for headcount."""
        data = self._api_data(payload)
        total = self._social_total(data)
        return EnrollmentNormalized(
            academic_year=academic_year,
            total_enrollment=coerce_optional_int(first_present(total, "finalTotal", "rowTotal")),
            rte_count=None,
            provenance={
                "source": DataSource.KYS.value,
                "endpoint": "getSocialData:1",
                "fields": {
                    "finalTotal": total.get("finalTotal"),
                    "rowBoyTotal": total.get("rowBoyTotal"),
                    "rowGirlTotal": total.get("rowGirlTotal"),
                },
            },
        )

    def parse_gender_totals_from_social_flag1(self, payload: dict[str, Any]) -> dict[str, int | None]:
        total = self._social_total(self._api_data(payload))
        return {
            "boys": coerce_optional_int(total.get("rowBoyTotal")),
            "girls": coerce_optional_int(total.get("rowGirlTotal")),
        }

    def parse_rte_from_social_flag5(self, payload: dict[str, Any], academic_year: str) -> int | None:
        data = self._api_data(payload)
        total = self._social_total(data)
        rte_from_total = coerce_optional_int(total.get("finalTotal"))
        if rte_from_total is not None:
            return rte_from_total

        dtos = data.get("schEnrollmentYearDataDTOS")
        if isinstance(dtos, list):
            for row in dtos:
                if not isinstance(row, dict):
                    continue
                name = str(row.get("enrollmentName") or "").upper()
                if name == "RTE":
                    return coerce_optional_int(row.get("rowTotal"))
        return None

    def parse_ews_from_social_flag4(self, payload: dict[str, Any]) -> int | None:
        total = self._social_total(self._api_data(payload))
        return coerce_optional_int(total.get("finalTotal"))

    def parse_report_card(self, payload: dict[str, Any], academic_year: str) -> EnrollmentNormalized:
        """Report-card does not carry enrollment totals on live KYS; kept for fixture compatibility."""
        data = self._api_data(payload)
        return EnrollmentNormalized(
            academic_year=academic_year,
            total_enrollment=coerce_optional_int(
                first_present(data, "totalEnrollment", "total_enrollment", "totalStudent")
            ),
            rte_count=coerce_optional_int(
                first_present(data, "rteCount", "rte_count", "rteStudent")
            ),
            provenance={
                "source": DataSource.KYS.value,
                "endpoint": "report-card",
                "fields": {
                    "totalEnrollment": data.get("totalEnrollment"),
                    "rteCount": data.get("rteCount"),
                },
            },
        )

    def parse_social_data_flag3(self, payload: dict[str, Any], academic_year: str) -> StudentDistributionNormalized:
        data = self._api_data(payload)
        total = self._social_total(data)
        reported_total = coerce_optional_int(first_present(total, "finalTotal", "rowTotal"))

        buckets: dict[str, Any] = {}
        dtos = data.get("schEnrollmentYearDataDTOS")
        if isinstance(dtos, list):
            for row in dtos:
                if not isinstance(row, dict):
                    continue
                item_id = row.get("itemId")
                row_total = coerce_optional_int(row.get("rowTotal"))
                if item_id is not None and row_total is not None:
                    buckets[str(item_id)] = row_total

        return StudentDistributionNormalized(
            academic_year=academic_year,
            distribution_type="getSocialData:3",
            reported_total=reported_total,
            buckets=buckets or None,
            validation_status=ValidationStatus.PENDING,
            provenance={
                "source": DataSource.KYS.value,
                "endpoint": "getSocialData:3",
                "fields": {
                    "finalTotal": total.get("finalTotal"),
                    "rowBoyTotal": total.get("rowBoyTotal"),
                    "rowGirlTotal": total.get("rowGirlTotal"),
                },
            },
        )

    def reconcile_flag3_with_enrollment(
        self,
        distribution: StudentDistributionNormalized,
        enrollment: EnrollmentNormalized,
    ) -> StudentDistributionNormalized:
        """Do not silently reconcile contradictory totals."""
        if distribution.reported_total is None or enrollment.total_enrollment is None:
            distribution.validation_status = ValidationStatus.PARTIAL
            distribution.data_quality = {
                "reason": "missing_total_for_reconciliation",
                "reported_total": distribution.reported_total,
                "annual_enrollment_total": enrollment.total_enrollment,
            }
            return distribution

        if distribution.reported_total != enrollment.total_enrollment:
            distribution.validation_status = ValidationStatus.NON_RECONCILING
            distribution.data_quality = {
                "reason": "distribution_total_mismatch",
                "reported_total": distribution.reported_total,
                "annual_enrollment_total": enrollment.total_enrollment,
            }
            return distribution

        distribution.validation_status = ValidationStatus.VALID
        distribution.data_quality = {"reason": "distribution_matches_enrollment"}
        return distribution

    def parse_teacher_year(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._api_data(payload)
        return {
            "teacher_count": coerce_optional_int(data.get("totalTeacher")),
            "details": {
                "totMale": data.get("totMale"),
                "totFemale": data.get("totFemale"),
                "tchReg": data.get("tchReg"),
                "tchCont": data.get("tchCont"),
                "tchPart": data.get("tchPart"),
            },
        }

    def parse_profile_contacts(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        data = self._api_data(payload)
        contacts: list[dict[str, Any]] = []
        if data.get("email"):
            contacts.append({"contact_type": "email", "contact_value": str(data["email"]), "label": "profile"})
        if data.get("schPhone"):
            contacts.append({"contact_type": "phone", "contact_value": str(data["schPhone"]), "label": "profile"})
        if data.get("address"):
            contacts.append({"contact_type": "address", "contact_value": str(data["address"]), "label": "profile"})
        if data.get("respName"):
            contacts.append(
                {"contact_type": "principal", "contact_value": str(data["respName"]), "label": "respName"}
            )
        return contacts

    def parse_facilities(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._api_data(payload)

    def parse_school_identity(
        self,
        report_card_payload: dict[str, Any],
        profile_payload: dict[str, Any] | None = None,
        *,
        kys_school_id: str | None = None,
        state_school_code: str | None = None,
        academic_year: str | None = None,
        year_id: int | None = None,
    ) -> KysSchoolIdentity:
        report = self._api_data(report_card_payload)
        profile = self._api_data(profile_payload or {})

        canonical_name = first_present(report, "schoolName", "schName")
        if canonical_name is not None:
            canonical_name = str(canonical_name).strip() or None

        district = title_case_location(first_present(report, "districtName", "district"))
        state = title_case_location(first_present(report, "stateName", "state"))
        pin_raw = first_present(report, "pincode", "pinCode", "pin_code")
        pin_code = normalize_identifier(str(pin_raw)) if pin_raw not in (None, "") else None

        address_line = first_present(profile, "address", "schAddress")
        if address_line is not None:
            address_line = str(address_line).strip() or None

        udise_raw = first_present(report, "udiseschCode", "udiseCode", "udiseSchCode", "udise")
        udise = normalize_identifier(str(udise_raw)) if udise_raw not in (None, "") else None

        return KysSchoolIdentity(
            canonical_name=canonical_name,
            district=district,
            state=state,
            pin_code=pin_code,
            address_line=address_line,
            udise=udise,
            kys_school_id=kys_school_id,
            state_school_code=state_school_code,
            academic_year=academic_year or (str(report.get("yearDesc")).strip() if report.get("yearDesc") else None),
            year_id=year_id,
            provenance={
                "source": DataSource.KYS.value,
                "endpoints": ["report-card", "profile"],
                "fields": {
                    "schoolName": report.get("schoolName"),
                    "districtName": report.get("districtName"),
                    "stateName": report.get("stateName"),
                    "pincode": report.get("pincode"),
                    "udiseschCode": report.get("udiseschCode"),
                    "address": profile.get("address"),
                },
            },
        )
