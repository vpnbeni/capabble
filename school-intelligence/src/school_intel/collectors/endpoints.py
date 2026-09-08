"""Verified KYS (UDISE+) public web API endpoint paths.

Discovered 2026-03-08 against schoolId=1519942 (Himalyan Public School).

School-scoped endpoints live under /web-app/api/school/.
Social-data endpoints live under /web-app/api/ (NOT under /school/).
"""

KYS_SCHOOL_API_BASE = "https://kys.udiseplus.gov.in/web-app/api/school"
KYS_API_BASE = "https://kys.udiseplus.gov.in/web-app/api"

# School annual endpoints — params: schoolId, yearId
SCHOOL_REPORT_CARD = "report-card"
SCHOOL_PROFILE = "profile"
SCHOOL_FACILITY = "facility"
SCHOOL_BY_YEAR = "by-year"

# Social data — params: flag, schoolId, yearId
SOCIAL_DATA = "getSocialData"

# Year discovery probes report-card with candidate yearId values.
YEAR_DISCOVERY_MAX_YEAR_ID = 20
