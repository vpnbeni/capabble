"""Shared constants for batch school collection."""

ACADEMIC_YEARS = [
    "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26",
]

DATA_GROUP_ENDPOINTS: dict[str, list[str]] = {
    "enrollment": ["report-card", "getSocialData:1"],
    "grade_distribution": ["getSocialData:1"],
    "student_categories": ["getSocialData:1", "getSocialData:2"],
    "age_distribution": ["getSocialData:3"],
    "rte_ews": ["getSocialData:4", "getSocialData:5"],
    "staff": ["report-card"],
    "facilities": ["facility"],
    "school_profile": ["profile"],
}

ALL_DATA_GROUPS = list(DATA_GROUP_ENDPOINTS.keys())

DEFAULT_DATA_GROUPS = ALL_DATA_GROUPS.copy()

KYS_ENDPOINT_LABELS: dict[str, str] = {
    "report-card": "Enrollment & staff",
    "profile": "School profile",
    "facility": "Facilities",
    "getSocialData:1": "Enrollment details",
    "getSocialData:2": "Student categories",
    "getSocialData:3": "Age distribution",
    "getSocialData:4": "Social indicators",
    "getSocialData:5": "RTE / EWS",
}


def endpoints_for_groups(groups: list[str]) -> list[str]:
    endpoints: list[str] = []
    for group in groups:
        for endpoint in DATA_GROUP_ENDPOINTS.get(group, []):
            if endpoint not in endpoints:
                endpoints.append(endpoint)
    return endpoints


def years_in_range(year_from: str, year_to: str) -> list[str]:
    if year_from not in ACADEMIC_YEARS or year_to not in ACADEMIC_YEARS:
        raise ValueError("Invalid academic year range")
    start = ACADEMIC_YEARS.index(year_from)
    end = ACADEMIC_YEARS.index(year_to)
    if start > end:
        raise ValueError("year_from must be before or equal to year_to")
    return ACADEMIC_YEARS[start : end + 1]


def endpoint_label(endpoint: str) -> str:
    return KYS_ENDPOINT_LABELS.get(endpoint, endpoint)
