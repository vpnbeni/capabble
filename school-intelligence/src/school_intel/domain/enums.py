from enum import StrEnum


class DataSource(StrEnum):
    KYS = "kys"
    SARAS = "saras"
    MANUAL = "manual"


class IdentifierType(StrEnum):
    UDISE = "udise"
    CBSE_AFFILIATION = "cbse_affiliation"
    STATE_SCHOOL_CODE = "state_school_code"
    KYS_SCHOOL_ID = "kys_school_id"


class CollectionRunType(StrEnum):
    SCHOOL = "school"
    YEAR = "year"
    BATCH = "batch"


class CollectionRunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class ValidationStatus(StrEnum):
    PENDING = "pending"
    VALID = "valid"
    PARTIAL = "partial"
    NON_RECONCILING = "non_reconciling"
    FAILED = "failed"


class IdentityMatchConfidence(StrEnum):
    EXACT = "exact"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class KysEndpoint(StrEnum):
    REPORT_CARD = "report-card"
    PROFILE = "profile"
    FACILITY = "facility"
    SOCIAL_DATA_1 = "getSocialData:1"
    SOCIAL_DATA_2 = "getSocialData:2"
    SOCIAL_DATA_3 = "getSocialData:3"
    SOCIAL_DATA_4 = "getSocialData:4"
    SOCIAL_DATA_5 = "getSocialData:5"


class ProspectStage(StrEnum):
    INTELLIGENCE = "intelligence"
    CRM = "crm"
    TENANT_CANDIDATE = "tenant_candidate"
    CONVERTED = "converted"


class TenantLinkStatus(StrEnum):
    UNLINKED = "unlinked"
    LINKED = "linked"
    CONVERTED = "converted"


class MatchingMethod(StrEnum):
    EXACT_UDISE = "exact_udise"
    EXACT_CBSE_AFFILIATION = "exact_cbse_affiliation"
    EXACT_STATE_SCHOOL_CODE = "exact_state_school_code"
    DETERMINISTIC_COMBO = "deterministic_combo"
    NAME_DISTRICT_PIN = "name_district_pin"
    FUZZY_NAME_ADDRESS = "fuzzy_name_address"


class MatchDecisionStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    AUTO_MERGED = "auto_merged"


class SarasSearchMode(StrEnum):
    STATE_WISE = "State_wise"
    KEYWORD_WISE = "Keyword_wise"
    AFFILIATION_WISE = "Affiliation_wise"
