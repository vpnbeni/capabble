export type CollectionSource = 'saras'

export interface GeographyState {
  id: string
  name: string
}

export interface GeographyDistrict {
  id: string
  name: string
}

export interface CollectionPreviewSchool {
  school_name: string
  affiliation_number: string
  school_code: string | null
  district: string | null
  state: string | null
  status: string | null
  school_id: string | null
  identity_status: string
  schol_identity: string
  collection_state: string
  planned_action: string
  kys_mapping_status: string
}

export interface CollectionPreview {
  source: string
  state: string
  state_id: string
  district: string
  district_id: string
  schools_found: number
  unique_schools: number
  duplicates: number
  malformed_records: number
  existing_canonical_schools: number
  existing_complete: number
  existing_incomplete: number
  new_schools: number
  unresolved_matches: number
  conflicts: number
  year_from: string
  year_to: string
  data_groups: string[]
  schools: CollectionPreviewSchool[]
}

export interface CollectionRunCreatePayload {
  source: string
  state_id: string
  state_name: string
  district_id: string
  district_name: string
  year_from: string
  year_to: string
  data_groups: string[]
  school_limit: string | number
  options: {
    skip_complete: boolean
    resume_incomplete: boolean
    skip_completed_endpoints: boolean
  }
  start_immediately?: boolean
}

export interface CollectionRunSummary {
  run_id: string
  status: string
  source: string
  pipeline?: string
  pipeline_description?: string
  discovery_source?: string
  enrichment_sources?: string[]
  pipeline_type?: string
  state?: string
  district?: string
  parameters: Record<string, unknown>
  total_count: number
  processed_count: number
  failed_count: number
  overall_percent: number
  status_counts: {
    complete: number
    in_progress: number
    partial: number
    needs_review: number
    remaining: number
    skipped: number
    failed: number
    unresolved: number
    kys_pending?: number
    conflict: number
    collected?: number
  }
  stage_progress: Record<string, { complete: number; total: number }>
  current_school: CollectionCurrentSchool | null
  started_at: string | null
  completed_at: string | null
}

export interface CollectionCurrentSchool {
  school_name: string
  affiliation_number: string
  school_id: string | null
  identity_status: string
  kys_mapping_status: string
  current_year: string | null
  current_operation: string | null
  years_total: number
  years_complete: number
  year_progress: Record<string, { status: string }>
  validation_status: string | null
  collection_status: string
}

export interface CollectionRunSchoolStatus {
  id: string
  position: number
  school_name: string
  affiliation_number: string
  school_code: string | null
  district: string | null
  school_id: string | null
  planned_action: string
  identity_status: string
  kys_mapping_status: string
  collection_status: string
  validation_status: string | null
  error_summary: string | null
  warning_summary: string | null
}

export interface ValidationStatusBlock {
  validation_status: string
  collection_status: string | null
  identity_status: string | null
  data_quality_status: string | null
  issue_count: number
}

export const DATA_GROUP_OPTIONS = [
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'grade_distribution', label: 'Grade distribution' },
  { id: 'student_categories', label: 'Student categories' },
  { id: 'age_distribution', label: 'Age distribution' },
  { id: 'rte_ews', label: 'RTE / EWS' },
  { id: 'staff', label: 'Staff' },
  { id: 'facilities', label: 'Facilities' },
  { id: 'school_profile', label: 'School profile' },
] as const

export const ACADEMIC_YEARS = [
  '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26',
]
