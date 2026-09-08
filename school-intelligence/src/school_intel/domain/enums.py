from enum import StrEnum


class DataSource(StrEnum):
    KYS = "kys"
    SARAS = "saras"
    MANUAL = "manual"


class IdentifierType(StrEnum):
    UDISE = "udise"
    CBSE_AFFILIATION = "cbse_affiliation"
    SARAS_SCHOOL_CODE = "saras_school_code"
    STATE_SCHOOL_CODE = "state_school_code"
    KYS_SCHOOL_ID = "kys_school_id"


class KysMappingStatus(StrEnum):
    MAPPED = "MAPPED"
    REVIEW = "REVIEW"
    PENDING = "PENDING"
    NOT_FOUND = "NOT_FOUND"


class KysMappingMethod(StrEnum):
    EXISTING_IDENTIFIER = "EXISTING_IDENTIFIER"
    KYS_SEARCH = "KYS_SEARCH"
    AUTHORITATIVE_EXTERNAL = "AUTHORITATIVE_EXTERNAL"
    OPERATOR_CONFIRMED = "OPERATOR_CONFIRMED"
    MANUAL_KYS_ID = "MANUAL_KYS_ID"
    NAME_DISTRICT_PIN = "NAME_DISTRICT_PIN"
    NAME_ADDRESS_DISTRICT = "NAME_ADDRESS_DISTRICT"
    FOUR_FIELD_MATCH = "FOUR_FIELD_MATCH"


class CollectionRunType(StrEnum):
    SCHOOL = "school"
    YEAR = "year"
    BATCH = "batch"


class CollectionRunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BatchSchoolCollectionStatus(StrEnum):
    NEW = "new"
    DISCOVERED = "discovered"
    IDENTITY_RESOLVED = "identity_resolved"
    IDENTITY_CREATED = "identity_created"
    KYS_MAPPING_PENDING = "kys_mapping_pending"
    KYS_MAPPING_REVIEW = "kys_mapping_review"
    KYS_MAPPED = "kys_mapped"
    COLLECTING = "collecting"
    COMPLETE = "complete"
    PARTIAL = "partial"
    FAILED = "failed"
    UNRESOLVED = "unresolved"  # legacy alias for kys_mapping_pending
    CONFLICT = "conflict"
    SKIPPED = "skipped"
    NEEDS_REVIEW = "needs_review"


class CollectionSchoolAction(StrEnum):
    NEW = "new"
    SKIP = "skip"
    RESUME = "resume"
    UPDATE = "update"
    REVIEW = "review"
    CONFLICT = "conflict"


class CollectionDataGroup(StrEnum):
    ENROLLMENT = "enrollment"
    GRADE_DISTRIBUTION = "grade_distribution"
    STUDENT_CATEGORIES = "student_categories"
    AGE_DISTRIBUTION = "age_distribution"
    RTE_EWS = "rte_ews"
    STAFF = "staff"
    FACILITIES = "facilities"
    SCHOOL_PROFILE = "school_profile"


class ValidationStatus(StrEnum):
    PENDING = "pending"
    VALID = "valid"
    PARTIAL = "partial"
    NON_RECONCILING = "non_reconciling"
    FAILED = "failed"


class CollectionOutcomeStatus(StrEnum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    FAILED = "failed"


class IdentityStatus(StrEnum):
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    CONFLICT = "conflict"


class DataQualityStatus(StrEnum):
    CLEAN = "clean"
    WARNING = "warning"
    ERROR = "error"


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
