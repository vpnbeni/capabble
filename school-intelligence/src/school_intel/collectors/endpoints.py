"""Verified KYS (UDISE+) public web API endpoint paths.

Discovered 2026-03-08 against schoolId=1519942 (Himalyan Public School).

School-scoped endpoints live under /web-app/api/school/.
Social-data endpoints live under /web-app/api/ (NOT under /school/).

Base URLs are NOT hardcoded here — `KysCollector` builds them from
`Settings.kys_base_url` so the host is actually overridable via
KYS_BASE_URL, instead of the previous dead config field.
"""

KYS_SCHOOL_API_PATH = "web-app/api/school"
KYS_API_PATH = "web-app/api"

# School annual endpoints — params: schoolId, yearId
SCHOOL_REPORT_CARD = "report-card"
SCHOOL_PROFILE = "profile"
SCHOOL_FACILITY = "facility"
# Returns the school's CURRENT/latest yearId+yearDesc in one call when
# called with action=1 (params: schoolId, action). Does NOT return a full
# year list — verified live 2026-09-21 against schoolId=1519942, which
# returned yearId=13/yearDesc="2026-27" with no historical year data.
# Used to bound `discover_academic_years`'s probe range instead of always
# probing up to YEAR_DISCOVERY_MAX_YEAR_ID.
SCHOOL_BY_YEAR = "by-year"

# Social data — params: flag, schoolId, yearId
SOCIAL_DATA = "getSocialData"

# Year discovery probes report-card with candidate yearId values, bounded by
# whichever is smaller: this cap, or the latest yearId learned from
# SCHOOL_BY_YEAR (see discover_academic_years).
YEAR_DISCOVERY_MAX_YEAR_ID = 20
