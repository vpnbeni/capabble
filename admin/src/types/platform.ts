export interface PlatformAdmin {
  _id: string
  email: string
  name: string
  isActive: boolean
}

export interface Tenant {
  _id: string
  slug: string
  name: string
  dbName: string
  adminEmail: string
  /** closed: the school closed its workspace; deleted: its data was purged (record kept for audit). */
  status: 'active' | 'suspended' | 'closed' | 'deleted'
  /** Set when the school asked to close its workspace (pending while canceledAt is empty). */
  closure?: {
    requestedAt?: string | null
    exportUntil?: string | null
    deleteAfter?: string | null
    canceledAt?: string | null
  } | null
  createdAt: string
  updatedAt?: string
}

export interface TenantFeaturePage {
  key: string
  label: string
  path: string
  group: string
  module: string
}

export interface TenantFeatureSummary {
  total: number
  disabled: number
  enabled: number
}

export interface TenantWithFeatureSummary extends Tenant {
  featureSummary: TenantFeatureSummary
}

export interface TenantFeatureConfigResponse {
  tenant: Tenant
  toggles: Record<string, boolean>
  pages: TenantFeaturePage[]
}

export interface DefaultTenantFeatureConfigResponse {
  toggles: Record<string, boolean>
  pages: TenantFeaturePage[]
}

export interface TenantListResponse {
  items: Tenant[]
  total: number
  page: number
  pages: number
  limit: number
}

export interface MasterSubject {
  _id: string
  name: string
  code: string
  class: '10th' | '12th'
  duration: 2 | 3
  answerSheet: 'none' | '32_pages' | '20_pages' | '40_graph'
  boardCode: string
  isTheorySubject: boolean
  isPracticalSubject: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SubjectStats {
  total: number
  class10th: number
  class12th: number
}

export interface MasterSubjectListResult extends SubjectStats {
  subjects: MasterSubject[]
}

export interface DatesheetEntry {
  examDate: string
  dayName: string
  subject: {
    code: string
    name: string
    class: '10th' | '12th'
    duration: number
  }
  timeSlot: {
    start: string
    end: string
  }
  answerSheet: '32_pages' | '20_pages' | '40_graph'
  isOptional: boolean
}

export interface MasterCBSEDatesheet {
  _id: string
  title: string
  academicYear: string
  totalEntries: number
  dateRange: {
    startDate: string
    endDate: string
  }
  statistics: {
    total: number
    class10th: number
    class12th: number
    uniqueDates: number
    uniqueSubjects: number
  }
  entries: DatesheetEntry[]
  isActive: boolean
  cloudinaryUrl?: string
  cloudinaryPublicId?: string
  createdAt: string
  updatedAt?: string
}

export interface GuidelineChapter {
  number: string
  title: string
  description?: string
}

export interface GuidelineAppendix {
  letter: string
  title: string
  subtitle?: string
}

export interface GuidelineItem {
  number: string
  text: string
}

export interface MasterGuideline {
  _id: string
  title: string
  academicYear: string
  cloudinaryUrl: string
  cloudinaryPublicId: string
  metadata: {
    pages?: number
    fileSize?: number
    totalCharacters?: number
  }
  parsedStructure: {
    chapters: GuidelineChapter[]
    appendices: GuidelineAppendix[]
    guidelines: GuidelineItem[]
    headings: string[]
  }
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

export interface MasterUndertaking {
  _id: string
  title: string
  academicYear: string
  cloudinaryUrl: string
  cloudinaryPublicId: string
  metadata: {
    pages?: number
    fileSize?: number
  }
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

export type MasterRemunerationDutyType =
  | 'CS'
  | 'QP Collection'
  | 'AB Deposit'
  | 'Centre Superintendent'
  | 'Deputy Centre Superintendent'
  | 'Observer'
  | 'Invigilator'
  | 'ASI (CCTV)'
  | 'ASI (Frisking Male)'
  | 'ASI (Frisking Female)'
  | 'Clerk'
  | 'Class IV'

export interface MasterRemunerationRate {
  _id: string
  dutyType: MasterRemunerationDutyType
  rates: {
    remuneration: number
    conveyance: number
    refreshment: number
  }
  isActive: boolean
  updatedBy?: string | null
  createdAt: string
  updatedAt?: string
}

export interface MasterPackingDispatch {
  packingClothColor: string
  packingMarker: string
  packingClothColorClass10: string
  packingMarkerClass10: string
  packingClothColorClass12: string
  packingMarkerClass12: string
  dispatchSlipToAddress: string
  dispatchSlipFromAddress: string
  dispatchSlipInsuredAmount: string
}

export interface MasterSchoolDirectory {
  _id: string
  srNo: number
  affiliationNo: string
  schoolCode: string
  state: string
  district: string
  status: string
  name: string
  headName: string
  website: string
  addressDetails: string
  manualType?: 'Govt.' | 'Private' | ''
  sourceFileName?: string
  lastImportedAt?: string
  createdAt: string
  updatedAt?: string
}

export interface SchoolDirectoryTypeSettings {
  govtKeywords: string[]
}

export type RolloutModule = 'subjects' | 'datesheet' | 'guidelines' | 'undertaking'
export type RolloutStatus = 'in_progress' | 'completed' | 'partial_failure'

export interface TenantRolloutStatus {
  tenantId: string
  tenantSlug: string
  status: 'pending' | 'success' | 'failed'
  error?: string
  recordsAffected?: number
  startedAt?: string
  completedAt?: string
}

export interface DataRollout {
  _id: string
  module: RolloutModule
  versionLabel: string
  masterDataId: string
  status: RolloutStatus
  summary: {
    totalTenants: number
    successCount: number
    failureCount: number
  }
  tenantStatuses: TenantRolloutStatus[]
  initiatedAt: string
  completedAt?: string
}

export interface UploadResult<TData = unknown> {
  success: boolean
  message: string
  data?: TData
  errors?: Array<{ row?: number; message: string }>
}


/* ── Workspace data (backups, closures, purges, re-imports) ────────────── */

export interface RetentionRule {
  prefix: string
  days?: number
  status?: string
}

export interface JobLease {
  _id: string
  lastRunAt?: string | null
  lastDay?: string | null
  attempts?: number
  lastResult?: unknown
}

export interface BackupRunFile {
  kind: 'central' | 'tenant' | 'billing'
  label?: string
  dbName?: string
  bytes?: number
  ok: boolean
  error?: string
}

export interface BackupRun {
  _id?: string
  runId: string
  trigger: 'scheduled' | 'manual'
  status: 'running' | 'ok' | 'partial' | 'failed'
  startedAt: string
  finishedAt?: string | null
  files: BackupRunFile[]
  error?: string
}

export interface ClosingWorkspace {
  _id: string
  slug: string
  name: string
  status: string
  closure: {
    requestedAt?: string | null
    exportUntil?: string | null
    deleteAfter?: string | null
    deletionNoticeSentAt?: string | null
  }
}

export interface PurgeActor {
  id?: string
  email?: string
  name?: string
}

export interface WorkspacePurge {
  _id: string
  slug: string
  name?: string
  status: 'awaiting_approval' | 'running' | 'done' | 'failed' | 'dismissed'
  dueAt?: string | null
  clockAt?: string | null
  createdAt: string
  approvedBy?: PurgeActor | null
  approvedAt?: string | null
  completedAt?: string | null
  plan?: unknown
  result?: Record<string, unknown> | null
  error?: string
}

export interface PurgePlan {
  dbName: string
  collections: number
  documents: number
  files: number
  sharedFilesKept: number
  directoryEntries: number
  onboardingTickets: number
  archives: number
}

export interface ImportPlan {
  ok: boolean
  errors: string[]
  warnings: string[]
  archive?: {
    createdAt?: string
    formatVersion?: number | string
    app?: { version?: string; commit?: string }
    tenant?: { slug?: string; name?: string; createdAt?: string }
  }
  target?: { slug: string; action: 'create' | 'reuse'; dbName: string; currentStatus?: string }
  database?: { sourceName?: string; collections?: number; documents?: number }
  files?: { count?: number; inArchive?: number; linksOnly?: number; mode?: string }
  migrations?: string[]
}

export interface WorkspaceImport {
  _id: string
  status: 'planned' | 'running' | 'done' | 'failed'
  targetSlug: string
  plan?: ImportPlan | null
  steps?: Array<{ at: string; text: string; ok?: boolean }>
  createdAt: string
  error?: string
}

export interface WorkspaceArchive {
  _id: string
  status: 'building' | 'ready' | 'failed' | 'deleted'
  reason: 'closure' | 'on_demand'
  createdAt: string
  readyAt?: string | null
  bytes?: number
  fileCount?: number
  filesMode?: string
  downloadUrl?: string | null
}

export interface WorkspaceDataOverview {
  storage: {
    configured: boolean
    driver: string
    bucket: string
    region: string
    prefix: string
    expectedRetention: Record<string, number>
    retention: RetentionRule[]
    retentionError?: string
  }
  jobs: {
    backupsEnabled: boolean
    lifecycleEnabled: boolean
    encryptionKeySet: boolean
    leases: JobLease[]
  }
  runs: BackupRun[]
  closing: ClosingWorkspace[]
  purges: WorkspacePurge[]
  imports: WorkspaceImport[]
}
