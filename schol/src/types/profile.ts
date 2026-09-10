export interface SarasDetailBlock {
  head_name: string | null
  address_line: string | null
  website: string | null
  pin_code: string | null
  year_of_foundation: string | null
  first_opening_date: string | null
  principal_gender: string | null
  principal_qualifications: string | null
  administrative_experience: string | null
  teaching_experience: string | null
  school_status: string | null
  school_type: string | null
  affiliation_period: string | null
  managing_society: string | null
  remarks: string | null
}

export interface SchoolProfile {
  school_id: string
  validation?: ValidationStatusBlock
  header: ProfileHeader
  saras_detail?: SarasDetailBlock | null
  kys_mapping?: KysMappingSummary
  overview: ProfileOverview
  enrollment: EnrollmentBlock
  staff: StaffBlock
  students: { distributions: StudentDistribution[] }
  facilities: FacilityItem[]
  facility_history: Record<string, FacilityHistoryRow[]>
  contacts: ContactItem[]
  affiliations: AffiliationItem[]
  sources: SourcesBlock
  data_quality: DataQualityIssue[]
  intelligence: IntelligenceBlock
}

export interface ProfileHeader {
  name: string
  location: string
  status: string
  school_type: string
  management: string
  board: string
  identifiers: {
    udise: string | null
    state_school_code: string | null
    saras_school_code?: string | null
    kys_school_id: string | null
    cbse_affiliation: string | null
  }
  established: string | number | null
  classes: string
}

export interface KysMappingSummary {
  status: 'pending' | 'connected' | 'review'
  label: string
  kys_school_id: string | null
  udise: string | null
  saras_school_code?: string | null
  cbse_affiliation?: string | null
  can_resolve: boolean
  has_kys_collection: boolean
}

export interface ProfileOverview {
  selected_year: string
  students: number | null
  teachers: number | null
  student_teacher_ratio: number | null
  enrollment_trend: {
    from: number | null
    to: number | null
    absolute_change: number | null
    percentage_change: number | null
    consecutive_declines: number
    years: string[]
    totals: (number | null)[]
  }
}

export interface EnrollmentBlock {
  series: EnrollmentYearRow[]
  trend: {
    absolute_change: number | null
    percentage_change: number | null
    consecutive_declines: number
  }
}

export interface EnrollmentYearRow {
  year: string
  total: number | null
  boys: number | null
  girls: number | null
  rte: number | null
  ews: number | null
}

export interface StaffBlock {
  series: { year: string; total: number | null; details: Record<string, unknown> }[]
  student_teacher_ratio_series: { year: string; ratio: number | null }[]
}

export interface StudentDistribution {
  year: string
  type: string
  reported_total: number | null
  validation_status: string
  data_quality: Record<string, unknown> | null
}

export interface FacilityItem {
  key: string
  label: string
  value: unknown
  year: string
}

export interface FacilityHistoryRow {
  year: string
  value: string
}

export interface ContactItem {
  type: string
  value: string
  label: string | null
}

export interface AffiliationItem {
  type: string
  number: string
  status: string | null
}

export interface SourcesBlock {
  kys: { years: { year: string; kys_collected: boolean; validation_status: string | null }[] }
  saras: { status: string; message: string }
}

export interface DataQualityIssue {
  code: string
  year: string
  message: string
  reported_enrollment: number | null
  distribution_total: number | null
  difference: number | null
  severity: string
}

export interface IntelligenceBlock {
  signals: { type: string; label: string; value: string; detail?: string }[]
  investigation_areas: string[]
}

export interface ValidationStatusBlock {
  validation_status: string
  collection_status: string | null
  identity_status: string | null
  data_quality_status: string | null
  issue_count: number
}

export interface YearDetail {
  academic_year: string
  enrollment: { total: number | null; rte: number | null }
  gender: { boys: number | null; girls: number | null } | null
  social_categories: Record<string, number | null> | null
  indicators: Record<string, number | null> | null
  grades: Record<string, { boys: number; girls: number; total: number }> | null
}

export interface DirectoryItem {
  id: string
  name: string
  location: string
  udise: string | null
  state_school_code: string | null
  students: number | null
  teachers: number | null
  enrollment_change_pct: number | null
  consecutive_declines: number | null
  collection_state?: string | null
  kys_enriched?: boolean
}
