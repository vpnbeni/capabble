import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarX, Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ExamTimelineItem } from '@/components/dashboard'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import {
  Badge,
  Button,
  Card,
  DataTable,
  DetailList,
  EmptyState,
  Entity,
  Icon,
  Page,
  PageHeader,
  Progress,
  Select,
  StatCard,
  cx,
  formatDate,
  orDash,
} from '@/components/ui'
import type { DataTableColumn } from '@/components/ui'
import { useTodaysExams, useDailyDuties, useDailyAnswerSheetSummary } from '@/hooks/useDashboard'
import { useCentreDatesheetEntries } from '@/hooks/useSeatingPlan'
import { useOnboardingStatus, useJobStatus } from '@/hooks/useOnboarding'
import type { CentreDatesheetEntry } from '@/services/centreDatesheetService'
import type { TodaysExamsResponse, TodaysExam } from '@/services/dashboardService'
import type { DailyDutiesResponse } from '@/services/dutiesService'
import type { DailySummaryResponse, DailySummaryClassData } from '@/services/answerSheetService'

// ─── Attendance progress toast ───────────────────────────────────────────────

const ATTENDANCE_JOB_KEY = 'cntr_attendance_job'

const STAGE_LABELS: Record<string, string> = {
  connecting: 'Connecting…',
  reading_x: 'Reading Class X PDF…',
  parsing_x: 'Parsing Class X…',
  uploading_x: 'Uploading Class X photos…',
  phase_x_done: 'Class X complete…',
  reading_xii: 'Reading Class XII PDF…',
  parsing_xii: 'Parsing Class XII…',
  uploading_xii: 'Uploading Class XII photos…',
  done: 'Finalising…',
  queued: 'Queued',
}

interface AttendanceProgressWidgetProps {
  jobId: string
  onDone: () => void
}

const AttendanceProgressWidget: React.FC<AttendanceProgressWidgetProps> = ({ jobId, onDone }) => {
  const { data, isError } = useJobStatus(jobId)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (data?.state === 'completed') {
      const r = data.result
      const xCount = r?.classX?.uploaded ?? 0
      const xiiCount = r?.classXII?.uploaded ?? 0
      toast.success(
        xCount + xiiCount > 0
          ? `Attendance processed. ${xCount + xiiCount} photos uploaded.`
          : 'Attendance sheets processed. No photos found in the tabular format.',
        { duration: 6000 }
      )
      localStorage.removeItem(ATTENDANCE_JOB_KEY)
      setTimeout(() => { setDismissed(true); onDone() }, 3500)
    } else if (data?.state === 'failed') {
      toast.error('Attendance processing failed. Retry it from onboarding.', { duration: 8000 })
      localStorage.removeItem(ATTENDANCE_JOB_KEY)
      setTimeout(() => { setDismissed(true); onDone() }, 4000)
    }
  }, [data?.state, data?.result, onDone])

  if (dismissed || isError) return null

  const percent = (data?.progress as any)?.percent ?? 0
  const stage = (data?.progress as any)?.stage ?? 'queued'
  const state = data?.state ?? 'waiting'
  const processed = (data?.progress as any)?.processed as number | undefined
  const total = (data?.progress as any)?.total as number | undefined

  const isFinished = state === 'completed' || state === 'failed'
  const stageLabel = STAGE_LABELS[stage] ?? 'Processing…'
  const tone = state === 'failed' ? 'danger' : state === 'completed' ? 'success' : 'info'
  const glyph = state === 'failed' ? X : state === 'completed' ? Check : Loader2

  return (
    <div className="cb-toaster">
      <div className={cx('cb-toast', `cb-toast--${tone}`)} role="status" aria-live="polite">
        <span className="cb-toast__icon">
          <Icon icon={glyph} size={14} />
        </span>
        <div className="cb-toast__text">
          <p className="cb-toast__title">Processing attendance</p>
          <p className="cb-toast__desc">
            {stageLabel}
            {typeof processed === 'number' && typeof total === 'number' && total > 0
              ? ` · ${processed} of ${total} photos`
              : ''}
          </p>
          <Progress
            value={state === 'completed' ? 100 : percent}
            tone={state === 'failed' ? 'danger' : state === 'completed' ? 'success' : 'accent'}
            size="sm"
            showValue={false}
          />
        </div>
        {isFinished && (
          <button
            type="button"
            onClick={() => { setDismissed(true); onDone() }}
            className="cb-toast__close"
            aria-label="Dismiss"
          >
            <Icon icon={X} size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const todayIso = (): string => new Date().toISOString().split('T')[0]

const normalizeClass = (v: string | undefined | null): 'X' | 'XII' | null => {
  if (!v) return null
  const s = v.toLowerCase()
  if (s.includes('10') || s === 'x') return 'X'
  if (s.includes('12') || s === 'xii') return 'XII'
  return null
}

const DASH = '—'

type ClassRow = { label: string; x: string | number; xii: string | number }

/** Detail | Class X | Class XII columns, showing only the classes sitting on this date. */
const classColumns = (hasX: boolean, hasXII: boolean): DataTableColumn<ClassRow>[] => [
  { key: 'label', header: 'Detail', mobile: 'title', render: (r) => <span className="cb-strong">{r.label}</span> },
  ...(hasX ? [{ key: 'x', header: 'Class X', wrap: true, render: (r: ClassRow) => r.x } as DataTableColumn<ClassRow>] : []),
  ...(hasXII ? [{ key: 'xii', header: 'Class XII', wrap: true, render: (r: ClassRow) => r.xii } as DataTableColumn<ClassRow>] : []),
]

const ViewLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => {
  const navigate = useNavigate()
  return (
    <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate(to)}>
      {children}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Papers on this date — Class X | Class XII */
const CandidateDetails: React.FC<{ data: TodaysExamsResponse }> = ({ data }) => {
  const exams = data.exams ?? []
  const byClass = (target: 'X' | 'XII') => exams.filter((e) => normalizeClass(e.class) === target)
  const classX = byClass('X')
  const classXII = byClass('XII')

  const agg = (list: TodaysExam[]) => {
    const rooms = list.reduce((s, e) => s + (e.roomsUsed || 0), 0)
    return {
      subject: list.map((e) => e.subjectName).join(', ') || DASH,
      code: list.map((e) => e.subjectCode).join(', ') || DASH,
      duration: list[0]?.duration ? `${list[0].duration} hr` : DASH,
      candidates: list.reduce((s, e) => s + (e.candidateCount || 0), 0),
      rooms,
      invigilators: rooms > 0 ? rooms * 2 : 0,
      hindi: list.reduce((s, e) => s + (e.hindiMediumCandidateCount || 0), 0),
      pwd: DASH,
    }
  }

  const x = agg(classX)
  const xii = agg(classXII)

  const rows: ClassRow[] = [
    { label: 'Subject', x: x.subject, xii: xii.subject },
    { label: 'Code', x: x.code, xii: xii.code },
    { label: 'Duration', x: x.duration, xii: xii.duration },
    { label: 'Candidates', x: x.candidates || DASH, xii: xii.candidates || DASH },
    { label: 'Rooms', x: x.rooms || DASH, xii: xii.rooms || DASH },
    { label: 'Invigilators', x: x.invigilators || DASH, xii: xii.invigilators || DASH },
    { label: 'Hindi medium', x: x.hindi || DASH, xii: xii.hindi || DASH },
    { label: 'PwD', x: x.pwd, xii: xii.pwd },
  ]

  return (
    <Card
      flush
      title="Papers on this date"
      subtitle="Candidates, rooms and invigilators by class"
      action={<ViewLink to="/datesheets">View date sheet</ViewLink>}
    >
      <DataTable
        caption="Papers on this date"
        columns={classColumns(classX.length > 0, classXII.length > 0)}
        rows={rows}
        getRowKey={(r) => r.label}
      />
    </Card>
  )
}

/** PwD candidates */
const PwdCandidates: React.FC<{ data: TodaysExamsResponse }> = ({ data: _data }) => {
  // TODO: When PwD candidate data is available from the API, render
  // the full table with Roll No, Room No, Scribe, Sheet No, Extra Time, etc.
  const hasPwdCandidates = false // will be driven by API data once available

  return (
    <Card title="PwD candidates" subtitle="Scribe and extra time for this date">
      {hasPwdCandidates ? null : (
        <EmptyState
          compact
          title="No PwD candidates on this date"
          body="Candidates who need a scribe or extra time will be listed here."
        />
      )}
    </Card>
  )
}

/** Duties */
const DutiesSummary: React.FC<{
  dashData: TodaysExamsResponse
  dutiesData?: DailyDutiesResponse
}> = ({ dashData, dutiesData }) => {
  const byType = dashData.dutiesByType ?? {}
  const totalAssigned = dashData.dutiesAssignedCount ?? dutiesData?.totalAssigned ?? 0

  const roles: { code: string; label: string; types: string[] }[] = [
    { code: 'CS', label: 'Centre superintendent', types: ['Centre Superintendent'] },
    { code: 'DCS', label: 'Deputy superintendent', types: ['Deputy Centre Superintendent'] },
    { code: 'OBR', label: 'Observer', types: ['Observer'] },
    { code: 'ASC', label: 'CCTV and frisking (male)', types: ['ASI (CCTV)', 'ASI (Frisking Male)'] },
    { code: 'ASI', label: 'Invigilators', types: ['Invigilator'] },
    { code: 'ASF', label: 'Frisking (female)', types: ['ASI (Frisking Female)'] },
    { code: 'CLR', label: 'Clerk', types: ['Clerk'] },
    { code: 'CLIV', label: 'Class IV', types: ['Class IV'] },
  ]

  const getCount = (types: string[]) => types.reduce((s, t) => s + (byType[t] || 0), 0)

  return (
    <Card title="Duties" subtitle={`${totalAssigned} assigned for this date`}>
      <DetailList
        columns={2}
        items={roles.map((r) => ({ label: r.label, value: <span className="is-num">{getCount(r.types)}</span> }))}
      />
    </Card>
  )
}

/** Answer sheets */
const AnswerSheetDetail: React.FC<{
  data: TodaysExamsResponse
  summary?: DailySummaryResponse
  isLoading?: boolean
}> = ({ data, summary, isLoading }) => {
  const exams = data.exams ?? []
  const hasX = exams.some((e) => normalizeClass(e.class) === 'X')
  const hasXII = exams.some((e) => normalizeClass(e.class) === 'XII')

  const getClassData = (classKey: string): DailySummaryClassData | null => {
    if (!summary?.classes) return null
    return summary.classes[classKey] ?? null
  }

  const classX = getClassData('10')
  const classXII = getClassData('12')

  const fmt = (val: DailySummaryClassData | null, field: 'type' | 'serialFrom' | 'serialTo' | 'totalAllocated' | 'totalDiscarded'): string | number => {
    if (!val) return DASH
    if (field === 'type') {
      const types = [...new Set(val.entries.map(e => `${e.answerSheetType} ${e.pages}p`))]
      return types.length ? types.join(', ') : DASH
    }
    if (field === 'serialFrom') return val.serialFrom || DASH
    if (field === 'serialTo') return val.serialTo || DASH
    if (field === 'totalAllocated') return val.totalAllocated || DASH
    if (field === 'totalDiscarded') return val.totalDiscarded || DASH
    return DASH
  }

  const rows: ClassRow[] = [
    { label: 'Type', x: fmt(classX, 'type'), xii: fmt(classXII, 'type') },
    { label: 'Serial from', x: fmt(classX, 'serialFrom'), xii: fmt(classXII, 'serialFrom') },
    { label: 'Serial to', x: fmt(classX, 'serialTo'), xii: fmt(classXII, 'serialTo') },
    { label: 'Allocated', x: fmt(classX, 'totalAllocated'), xii: fmt(classXII, 'totalAllocated') },
    { label: 'Discarded', x: fmt(classX, 'totalDiscarded'), xii: fmt(classXII, 'totalDiscarded') },
  ]

  return (
    <Card
      flush
      title="Answer sheets"
      subtitle="Serial ranges issued for this date"
      action={<ViewLink to="/answersheets">View answer sheets</ViewLink>}
    >
      {isLoading ? (
        <CardLoading label="Loading answer sheets…" />
      ) : (
        <DataTable
          caption="Answer sheets"
          columns={classColumns(hasX, hasXII)}
          rows={rows}
          getRowKey={(r) => r.label}
        />
      )}
    </Card>
  )
}

/** Preparation status */
const StatusTracker: React.FC<{ data: TodaysExamsResponse; dutiesData?: DailyDutiesResponse }> = ({
  data,
  dutiesData,
}) => {
  const exams = data.exams ?? []
  const hasRooms = exams.some((e) => e.roomsUsed > 0)
  const totalRooms = exams.reduce((s, e) => s + (e.roomsUsed || 0), 0)

  // DutySelection count (functionaries selected for this date)
  const selectionsCount = data.dutiesAssignedCount ?? 0
  const hasSelections = selectionsCount > 0

  // DutyAssignment count (actual room-level invigilator assignments)
  const assignmentsCount = dutiesData?.totalAssigned ?? 0
  const hasAssignments = assignmentsCount > 0

  const items: { label: string; status: string | null }[] = [
    { label: 'Room selection', status: hasRooms ? 'Selected' : null },
    { label: 'Room allocation', status: hasRooms ? 'Allotted' : null },
    { label: 'Seating plan', status: hasRooms ? `${totalRooms} of ${totalRooms} downloaded` : null },
    { label: 'Functionary update', status: hasSelections ? 'New functionary added' : null },
    { label: 'Functionary selection', status: hasSelections ? `${selectionsCount} selected` : null },
    { label: 'Duty assignment', status: hasAssignments ? `${assignmentsCount} of ${totalRooms} rooms` : null },
  ]

  const done = items.filter((i) => i.status).length

  return (
    <Card title="Preparation" subtitle={`${done} of ${items.length} steps done`}>
      <DetailList
        columns={1}
        items={items.map((item) => ({
          label: item.label,
          value: item.status ? (
            <Badge tone="success">{item.status}</Badge>
          ) : (
            <Badge tone="warning">Pending</Badge>
          ),
        }))}
      />
    </Card>
  )
}

/** Packing */
const PackingDetails: React.FC<{ data: TodaysExamsResponse }> = ({ data }) => {
  const p = data.packing
  const exams = data.exams ?? []

  const xExams = exams.filter((e) => normalizeClass(e.class) === 'X')
  const xiiExams = exams.filter((e) => normalizeClass(e.class) === 'XII')

  const xCandidates = xExams.reduce((s, e) => s + (e.candidateCount || 0), 0)
  const xiiCandidates = xiiExams.reduce((s, e) => s + (e.candidateCount || 0), 0)

  // QP packets = number of exams per class
  const xQP = xExams.length
  const xiiQP = xiiExams.length

  // Answer sheet bags (estimate: 1 bag per ~100 candidates, min 1 if >0)
  const xBags = xCandidates ? Math.max(1, Math.ceil(xCandidates / 100)) : 0
  const xiiBags = xiiCandidates ? Math.max(1, Math.ceil(xiiCandidates / 100)) : 0

  const rows: ClassRow[] = [
    { label: 'Cloth', x: p?.clothColorClass10 || p?.clothColor || DASH, xii: p?.clothColorClass12 || p?.clothColor || DASH },
    { label: 'Pen', x: p?.markerClass10 || p?.marker || DASH, xii: p?.markerClass12 || p?.marker || DASH },
    { label: 'Question paper packets', x: xQP || DASH, xii: xiiQP || DASH },
    { label: 'Answer sheet bags', x: xBags || DASH, xii: xiiBags || DASH },
  ]

  return (
    <Card flush title="Packing" subtitle="Cloth, pen and bags to dispatch">
      <DataTable
        caption="Packing"
        columns={classColumns(xExams.length > 0, xiiExams.length > 0)}
        rows={rows}
        getRowKey={(r) => r.label}
      />
    </Card>
  )
}

/** Candidates by school */
const SchoolWiseDistribution: React.FC<{ data: TodaysExamsResponse }> = ({ data }) => {
  const exams = data.exams ?? []

  const hasX = exams.some((e) => normalizeClass(e.class) === 'X')
  const hasXII = exams.some((e) => normalizeClass(e.class) === 'XII')

  // Aggregate school-wise by class
  const map = new Map<string, { x: number; xii: number }>()
  exams.forEach((exam) => {
    const cls = normalizeClass(exam.class)
    ;(exam.schoolWiseCandidateCount ?? []).forEach((row) => {
      const key = row.schoolName || DASH
      const cur = map.get(key) || { x: 0, xii: 0 }
      if (cls === 'X') cur.x += row.count || 0
      if (cls === 'XII') cur.xii += row.count || 0
      map.set(key, cur)
    })
  })

  type SchoolRow = { name: string; x: number; xii: number; total: number }
  const rows: SchoolRow[] = Array.from(map.entries())
    .map(([name, counts]) => ({ name, x: counts.x, xii: counts.xii, total: counts.x + counts.xii }))
    .sort((a, b) => b.total - a.total)

  const totalX = rows.reduce((s, r) => s + r.x, 0)
  const totalXII = rows.reduce((s, r) => s + r.xii, 0)
  const grandTotal = totalX + totalXII

  const columns: DataTableColumn<SchoolRow>[] = [
    { key: 'name', header: 'School', mobile: 'title', wrap: true },
    ...(hasX ? [{ key: 'x', header: 'Class X', align: 'right', numeric: true, render: (r: SchoolRow) => r.x || DASH } as DataTableColumn<SchoolRow>] : []),
    ...(hasXII ? [{ key: 'xii', header: 'Class XII', align: 'right', numeric: true, render: (r: SchoolRow) => r.xii || DASH } as DataTableColumn<SchoolRow>] : []),
    { key: 'total', header: 'Total', align: 'right', numeric: true, mobile: 'aside', render: (r) => <span className="cb-strong">{r.total}</span> },
  ]

  const totalParts = [hasX ? `Class X ${totalX || DASH}` : null, hasXII ? `Class XII ${totalXII || DASH}` : null].filter(Boolean)

  return (
    <Card flush title="Candidates by school" subtitle={rows.length ? `${rows.length} schools sitting on this date` : undefined}>
      <DataTable
        caption="Candidates by school"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.name}
        empty={<EmptyState compact title="No school data for this date" body="School counts come from the imported candidate list." />}
        footer={
          rows.length > 0 ? (
            <span className="cb-muted">
              {totalParts.join(' · ')}
              {totalParts.length ? ' · ' : ''}
              <span className="cb-strong">{grandTotal} in total</span>
            </span>
          ) : undefined
        }
      />
    </Card>
  )
}

/** Upcoming exams */
const UpcomingExamDetails: React.FC<{
  entries: CentreDatesheetEntry[]
  selectedDate: string
}> = ({ entries, selectedDate }) => {
  const afterDate = selectedDate || todayIso()

  const upcoming = entries
    .filter((entry) => {
      const d = new Date(entry.examDate)
      return d.toISOString().slice(0, 10) > afterDate
    })
    .slice(0, 5)

  const columns: DataTableColumn<CentreDatesheetEntry>[] = [
    {
      key: 'date',
      header: 'Date',
      mobile: 'subtitle',
      render: (entry) => {
        const d = new Date(entry.examDate)
        const dayName = entry.dayName || d.toLocaleDateString('en-IN', { weekday: 'short' })
        return <Entity primary={formatDate(d)} secondary={dayName} />
      },
    },
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      render: (entry) => <Entity primary={orDash(entry.subjectName)} secondary={entry.subjectCode} />,
    },
    { key: 'class', header: 'Class', render: (entry) => orDash(entry.class) },
    { key: 'candidates', header: 'Candidates', align: 'right', numeric: true, mobile: 'aside', render: (entry) => entry.candidateCount ?? DASH },
    { key: 'rooms', header: 'Rooms needed', align: 'right', numeric: true, render: (entry) => entry.roomsNeeded ?? DASH },
    { key: 'hindi', header: 'Hindi medium', align: 'right', mobile: 'hidden', render: () => DASH },
    { key: 'pwd', header: 'PwD', align: 'right', mobile: 'hidden', render: () => DASH },
    { key: 'scribe', header: 'Scribe', align: 'right', mobile: 'hidden', render: () => DASH },
  ]

  return (
    <Card flush title="Upcoming exams" subtitle="Next five papers after this date">
      <DataTable
        caption="Upcoming exams"
        columns={columns}
        rows={upcoming}
        getRowKey={(entry) => entry._id || `${entry.examDate}-${entry.subjectCode}-${entry.class}`}
        empty={<EmptyState compact title="No exams after this date" body="Import the date sheet to schedule more papers." />}
      />
    </Card>
  )
}

/** Rooms and invigilators */
const SeatingInvigilatorDetails: React.FC<{
  data: TodaysExamsResponse
  dutiesData?: DailyDutiesResponse
}> = ({ data, dutiesData }) => {
  const exams = data.exams ?? []

  type RoomRow = {
    roomNo: string
    candidates: number
    school: string
    inv1: string
    inv1Id: string
    inv2: string
    inv2Id: string
  }

  // Aggregate rooms across all exams
  const roomMap = new Map<string, { candidates: number; subjects: string[] }>()
  exams.forEach((exam) => {
    ;(exam.rooms ?? []).forEach((room) => {
      const cur = roomMap.get(room.roomNo) || { candidates: 0, subjects: [] }
      cur.candidates += room.candidates || 0
      cur.subjects.push(`${exam.subjectName}`)
      roomMap.set(room.roomNo, cur)
    })
  })

  // Build duty lookup by room
  const dutyByRoom = new Map<string, { inv1Name: string; inv1Id: string; inv2Name: string; inv2Id: string }>()
  if (dutiesData?.duties) {
    dutiesData.duties.forEach((duty) => {
      const roomNo = duty.room?.roomNo
      if (!roomNo) return
      dutyByRoom.set(roomNo, {
        inv1Name: duty.functionary?.name ?? DASH,
        inv1Id: duty.functionary?.employeeId ?? '',
        inv2Name: duty.functionary2?.name ?? DASH,
        inv2Id: duty.functionary2?.employeeId ?? '',
      })
    })
  }

  // School names from dutiesData (keyed by roomNo)
  const schoolByRoom = dutiesData?.roomSchoolNames ?? {}

  const rows: RoomRow[] = Array.from(roomMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([roomNo, info]) => {
      const duty = dutyByRoom.get(roomNo)
      const schools = schoolByRoom[roomNo]
      return {
        roomNo,
        candidates: info.candidates,
        school: Array.isArray(schools) ? schools.join(', ') : DASH,
        inv1: duty?.inv1Name ?? DASH,
        inv1Id: duty?.inv1Id ?? '',
        inv2: duty?.inv2Name ?? DASH,
        inv2Id: duty?.inv2Id ?? '',
      }
    })

  const columns: DataTableColumn<RoomRow>[] = [
    { key: 'roomNo', header: 'Room', mobile: 'title', render: (r) => <span className="cb-strong">{r.roomNo}</span> },
    { key: 'candidates', header: 'Candidates', align: 'right', numeric: true, mobile: 'aside' },
    { key: 'school', header: 'School', wrap: true },
    { key: 'inv1', header: 'Invigilator 1', render: (r) => <Entity primary={r.inv1} secondary={r.inv1Id || undefined} /> },
    { key: 'inv2', header: 'Invigilator 2', render: (r) => <Entity primary={r.inv2} secondary={r.inv2Id || undefined} /> },
  ]

  return (
    <Card flush title="Rooms and invigilators" subtitle={rows.length ? `${rows.length} rooms in use` : undefined}>
      <DataTable
        caption="Rooms and invigilators"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.roomNo}
        empty={<EmptyState compact title="No rooms allotted for this date" body="Allot rooms in the seating plan to see invigilators here." />}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState<string>(todayIso())

  // --- onboarding check ---
  const { data: onboardingStatus } = useOnboardingStatus()

  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.hasSession) {
      navigate('/onboarding', { replace: true })
    }
  }, [onboardingStatus, navigate])

  // --- attendance background job ---
  // Read jobId from localStorage on mount (set by OnboardingWizard after queuing)
  const [pendingJobId, setPendingJobId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(ATTENDANCE_JOB_KEY)
      if (!stored) return null
      const parsed = JSON.parse(stored) as { jobId: string; enqueuedAt: number }
      // Discard stale jobs older than 24 hours
      if (Date.now() - parsed.enqueuedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(ATTENDANCE_JOB_KEY)
        return null
      }
      return parsed.jobId ?? null
    } catch {
      return null
    }
  })

  // --- data fetching ---
  const {
    data: todaysExamsData,
    isLoading: isDashboardLoading,
  } = useTodaysExams(selectedDate)

  const { data: centreDatesheetEntries } = useCentreDatesheetEntries()

  const { data: dutiesData } = useDailyDuties(selectedDate)

  const { data: dailyAnswerSheetSummary, isLoading: isDailySummaryLoading } = useDailyAnswerSheetSummary(selectedDate)

  // --- exam timeline items ---
  const examTimelineItems: ExamTimelineItem[] = useMemo(() => {
    const entries = centreDatesheetEntries ?? []
    return entries.map((entry: CentreDatesheetEntry) => {
      const d = new Date(entry.examDate)
      const dateStr = d.toISOString().slice(0, 10)
      return {
        date: dateStr,
        subject: entry.subjectName ?? 'Exam',
        subjectCode: entry.subjectCode,
        class: entry.class,
      }
    })
  }, [centreDatesheetEntries])

  // --- auto-select the best exam date on load ---
  // If today has no exam, pick the nearest future exam date (or last past date).
  const hasAutoSelected = useRef(false)
  useEffect(() => {
    if (hasAutoSelected.current || examTimelineItems.length === 0) return
    const today = todayIso()
    const uniqueDates = Array.from(new Set(examTimelineItems.map((e) => e.date))).sort()

    // If today is an exam date, keep it
    if (uniqueDates.includes(today)) {
      hasAutoSelected.current = true
      return
    }

    // Find the nearest future exam date
    const nextDate = uniqueDates.find((d) => d > today)
    // Or fall back to the last past exam date
    const bestDate = nextDate ?? uniqueDates[uniqueDates.length - 1]

    if (bestDate) {
      setSelectedDate(bestDate)
    }
    hasAutoSelected.current = true
  }, [examTimelineItems])

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date)
  }, [])

  // --- exam date picker (replaces the old timeline strip) ---
  const examDates = useMemo(
    () => Array.from(new Set(examTimelineItems.map((e) => e.date))).sort(),
    [examTimelineItems]
  )
  const dateOptions = useMemo(() => {
    const today = todayIso()
    const dates = examDates.includes(selectedDate) ? examDates : [...examDates, selectedDate].sort()
    return dates.map((date) => {
      const subjects = Array.from(
        new Set(examTimelineItems.filter((e) => e.date === date).map((e) => e.subject))
      )
      const when = `${formatDate(`${date}T12:00:00`)}${date === today ? ' (today)' : ''}`
      return { value: date, label: subjects.length ? `${when} · ${subjects.join(', ')}` : `${when} · No exam` }
    })
  }, [examDates, examTimelineItems, selectedDate])
  const prevDate = [...examDates].reverse().find((d) => d < selectedDate)
  const nextDate = examDates.find((d) => d > selectedDate)

  // --- render ---
  const hasData = !!todaysExamsData
  const centreEntries = centreDatesheetEntries ?? []
  const totalExams = todaysExamsData?.totalExams ?? 0

  const exams = todaysExamsData?.exams ?? []
  const candidatesFor = (cls: 'X' | 'XII') =>
    exams.filter((e) => normalizeClass(e.class) === cls).reduce((s, e) => s + (e.candidateCount || 0), 0)
  const totalCandidates = exams.reduce((s, e) => s + (e.candidateCount || 0), 0)
  const totalRooms = exams.reduce((s, e) => s + (e.roomsUsed || 0), 0)
  const functionariesSelected = todaysExamsData?.dutiesAssignedCount ?? 0
  const roomsAssigned = dutiesData?.totalAssigned ?? 0
  const candidateHint = [
    exams.some((e) => normalizeClass(e.class) === 'X') ? `Class X ${candidatesFor('X')}` : null,
    exams.some((e) => normalizeClass(e.class) === 'XII') ? `Class XII ${candidatesFor('XII')}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const dateTitle = formatDate(`${selectedDate}T12:00:00`)
  const subtitle = [
    todaysExamsData?.dayName,
    totalExams ? `${totalExams} ${totalExams === 1 ? 'paper' : 'papers'}` : 'No exam on this date',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Page>
      {/* Attendance progress — only shown while a job is pending */}
      {pendingJobId && (
        <AttendanceProgressWidget
          jobId={pendingJobId}
          onDone={() => setPendingJobId(null)}
        />
      )}

      <PageHeader
        title={dateTitle}
        subtitle={subtitle}
        actions={
          <>
            <Button
              variant="tertiary"
              icon={ChevronLeft}
              aria-label="Previous exam date"
              disabled={!prevDate}
              onClick={() => prevDate && handleSelectDate(prevDate)}
            />
            <Select
              aria-label="Exam date"
              size="sm"
              value={selectedDate}
              options={dateOptions}
              onChange={(event) => handleSelectDate(event.target.value)}
            />
            <Button
              variant="tertiary"
              icon={ChevronRight}
              aria-label="Next exam date"
              disabled={!nextDate}
              onClick={() => nextDate && handleSelectDate(nextDate)}
            />
          </>
        }
      />

      {isDashboardLoading && (
        <Card>
          <CardLoading label="Loading the exam day…" />
        </Card>
      )}

      {hasData && !isDashboardLoading && totalExams > 0 && (
        <>
          <section className="cb-stats" aria-label="This exam day">
            <StatCard label="Candidates sitting" value={totalCandidates} hint={candidateHint || undefined} />
            <StatCard label="Rooms in use" value={totalRooms} hint={`${totalRooms * 2} invigilators needed`} />
            <StatCard
              label="Functionaries selected"
              value={functionariesSelected}
              hint={functionariesSelected ? 'For duty on this date' : 'None selected yet'}
            />
            <StatCard
              label="Rooms with invigilators"
              value={roomsAssigned}
              unit={totalRooms ? `of ${totalRooms}` : undefined}
              hint={totalRooms && roomsAssigned >= totalRooms ? 'Every room covered' : 'Assign duties before the exam'}
              progress={totalRooms ? Math.min(100, Math.round((roomsAssigned / totalRooms) * 100)) : undefined}
            />
          </section>

          <div className="cb-grid-8-4">
            <CandidateDetails data={todaysExamsData} />
            <div className="cb-stack">
              <StatusTracker data={todaysExamsData} dutiesData={dutiesData} />
              <DutiesSummary dashData={todaysExamsData} dutiesData={dutiesData} />
            </div>
          </div>

          <div className="cb-grid-6-6">
            <AnswerSheetDetail
              data={todaysExamsData}
              summary={dailyAnswerSheetSummary}
              isLoading={isDailySummaryLoading}
            />
            <PackingDetails data={todaysExamsData} />
          </div>

          <div className="cb-grid-8-4">
            <SchoolWiseDistribution data={todaysExamsData} />
            <PwdCandidates data={todaysExamsData} />
          </div>

          <SeatingInvigilatorDetails data={todaysExamsData} dutiesData={dutiesData} />

          <UpcomingExamDetails entries={centreEntries} selectedDate={selectedDate} />
        </>
      )}

      {hasData && !isDashboardLoading && totalExams === 0 && (
        <>
          <Card>
            <EmptyState
              icon={CalendarX}
              title={`No exams on ${todaysExamsData?.dayName || 'this date'}`}
              body={
                examDates.length
                  ? 'Pick another exam date above.'
                  : 'Import the date sheet to see each exam day here.'
              }
              action={
                examDates.length ? undefined : (
                  <Button onClick={() => navigate('/datesheets')}>Import date sheet</Button>
                )
              }
            />
          </Card>
          <UpcomingExamDetails entries={centreEntries} selectedDate={selectedDate} />
        </>
      )}
    </Page>
  )
}

export default Dashboard
