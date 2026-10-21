import React, { useMemo } from 'react'
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Circle,
  FileText,
  Package,
} from 'lucide-react'
import type { TodaysExamsResponse, TodaysExam, AnswerSheetUsedDetail, SchoolWiseCount } from '@/services/dashboardService'

export type TodaysExamControlPanelProps = {
  data?: TodaysExamsResponse | null
  isLoading?: boolean
}

type ClassSummary = {
  label: string
  candidates: number
  rooms: number
  invigilators: number
  hindiMedium: number
  pwd: number
  durationHours?: number
}

type SchoolRow = {
  schoolName: string
  xCount: number
  xiiCount: number
  total: number
}

const normalizeClassKey = (value: string | undefined | null): 'X' | 'XII' | null => {
  if (!value) return null
  const v = value.toLowerCase()
  if (v.includes('10')) return 'X'
  if (v.includes('12')) return 'XII'
  if (v === 'x') return 'X'
  if (v === 'xii') return 'XII'
  return null
}

const aggregateClassSummary = (exams: TodaysExam[], target: 'X' | 'XII'): ClassSummary => {
  const filtered = exams.filter((exam) => normalizeClassKey(exam.class) === target)
  const candidates = filtered.reduce((sum, e) => sum + (e.candidateCount || 0), 0)
  const rooms = filtered.reduce((sum, e) => sum + (e.roomsUsed || 0), 0)
  const hindiMedium = filtered.reduce((sum, e) => sum + (e.hindiMediumCandidateCount || 0), 0)
  const durationHours = filtered.length > 0 ? filtered[0].duration || 0 : 0
  return {
    label: target === 'X' ? 'Class X' : 'Class XII',
    candidates,
    rooms,
    invigilators: 0,
    hindiMedium,
    pwd: 0,
    durationHours,
  }
}

const buildSchoolRows = (exams: TodaysExam[]): SchoolRow[] => {
  const map = new Map<string, { x: number; xii: number }>()

  exams.forEach((exam) => {
    const classKey = normalizeClassKey(exam.class)
    const isX = classKey === 'X'
    const isXII = classKey === 'XII'
    if (!isX && !isXII) return
    const rows: SchoolWiseCount[] = exam.schoolWiseCandidateCount || []
    rows.forEach((row) => {
      const key = row.schoolName || '—'
      const current = map.get(key) || { x: 0, xii: 0 }
      if (isX) current.x += row.count || 0
      if (isXII) current.xii += row.count || 0
      map.set(key, current)
    })
  })

  return Array.from(map.entries())
    .map(([schoolName, counts]) => ({
      schoolName,
      xCount: counts.x,
      xiiCount: counts.xii,
      total: counts.x + counts.xii,
    }))
    .sort((a, b) => b.total - a.total)
}

const aggregateAnswerSheets = (details: AnswerSheetUsedDetail[]) => {
  if (!details.length) {
    return {
      type: '—',
      seriesFrom: undefined as string | undefined,
      seriesTo: undefined as string | undefined,
      totalUsed: 0,
    }
  }

  const type = details[0].type || '—'

  const sorted = [...details].sort((a, b) => a.serialFrom.localeCompare(b.serialFrom))
  const seriesFrom = sorted[0]?.serialFrom
  const seriesTo = sorted[sorted.length - 1]?.serialTo

  const totalUsed = details.reduce((sum, sheet) => {
    const fromNum = parseInt(sheet.serialFrom.replace(/\D/g, ''), 10)
    const toNum = parseInt(sheet.serialTo.replace(/\D/g, ''), 10)
    if (!Number.isFinite(fromNum) || !Number.isFinite(toNum) || toNum < fromNum) {
      return sum
    }
    return sum + (toNum - fromNum + 1)
  }, 0)

  return { type, seriesFrom, seriesTo, totalUsed }
}

const ClassCard: React.FC<{
  summary: ClassSummary
  accent: 'orange' | 'purple'
}> = ({ summary, accent }) => {
  const accentClasses =
    accent === 'orange'
      ? 'border-orange-400 bg-gradient-to-br from-orange-50 via-white to-orange-50/40'
      : 'border-purple-400 bg-gradient-to-br from-purple-50 via-white to-purple-50/40'

  return (
    <div className={`relative rounded-xl border ${accentClasses} shadow-sm px-4 py-3 flex items-center justify-between gap-4`}>
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-gray-800 bg-opacity-70 shadow-xs">
            <Users className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {summary.label}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">Candidates</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{summary.candidates || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">Rooms</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{summary.rooms || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">Invigilators</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{summary.invigilators || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">Hindi Medium</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{summary.hindiMedium || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">PwD</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{summary.pwd || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">Duration</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              {summary.durationHours ? `${summary.durationHours} Hours` : '—'}
            </span>
          </div>
        </div>
      </div>
      <div className="flex-shrink-0">
        <div className="relative w-16 h-16 rounded-full border-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
          <div className="absolute inset-1 rounded-full border border-emerald-200 dark:border-emerald-800" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">100%</span>
        </div>
        <p className="mt-1 text-[10px] text-center text-emerald-600 font-medium">
          Allocated
        </p>
      </div>
    </div>
  )
}

const DutiesSummaryCard: React.FC<{ assigned: number; byType?: Record<string, number> }> = ({
  assigned,
  byType = {},
}) => {
  const totalPlanned = 22
  const roles = ['CS', 'DCS', 'OBR', 'ASI', 'ASF', 'ASC', 'CLR', 'CLIV'] as const

  const dutyTypesByRole: Record<(typeof roles)[number], string[]> = {
    CS: ['Centre Superintendent'],
    DCS: ['Deputy Centre Superintendent'],
    OBR: ['Observer'],
    ASI: ['Invigilator'],
    ASF: ['ASI (Frisking Female)'],
    ASC: ['ASI (CCTV)', 'ASI (Frisking Male)'],
    CLR: ['Clerk'],
    CLIV: ['Class IV'],
  }

  const getCountForRole = (role: (typeof roles)[number]) => {
    const types = dutyTypesByRole[role] || []
    return types.reduce((sum, t) => sum + (byType[t] || 0), 0)
  }

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer"
      onClick={() => {
        window.location.hash = '#/duties'
      }}
      title="View and manage detailed duties for this exam date"
    >
      <div className="px-4 py-2.5 bg-gray-900 text-white flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <ClipboardListIcon />
          <span className="font-semibold">Duties Summary</span>
        </div>
        <span className="text-[11px] font-semibold">
          Total {assigned}/{totalPlanned}
        </span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {roles.map((role) => (
          <div key={role} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
              <span className="font-semibold text-gray-800 dark:text-gray-200">{role}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800 font-semibold min-w-[1.5rem] text-center">
                {getCountForRole(role)}
              </span>
              <span>Assigned</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const SchoolTable: React.FC<{
  rows: SchoolRow[]
  totalCandidates: number
  totalsMatch: boolean
}> = ({ rows, totalCandidates, totalsMatch }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between text-xs border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-indigo-600" aria-hidden />
          <span className="font-semibold text-gray-900 dark:text-gray-100">School-wise Distribution</span>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
            totalsMatch
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-amber-50 text-amber-700 border border-amber-100'
          }`}
        >
          {totalsMatch ? (
            <>
              <CheckCircle2 className="w-3 h-3" aria-hidden />
              <span>Totals match</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3" aria-hidden />
              <span>Mismatch detected</span>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto text-xs">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">School Name</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">X</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">XII</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((row, idx) => (
              <tr key={row.schoolName} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/40'}>
                <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">{row.schoolName}</td>
                <td className="px-3 py-1.5 text-center text-gray-700 dark:text-gray-300">{row.xCount || '—'}</td>
                <td className="px-3 py-1.5 text-center text-gray-700 dark:text-gray-300">{row.xiiCount || '—'}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-gray-900 dark:text-gray-100">{row.total || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <td className="px-3 py-1.5 text-right font-semibold text-gray-700 dark:text-gray-300" colSpan={3}>
                Total Candidates
              </td>
              <td className="px-3 py-1.5 text-right font-bold text-gray-900 dark:text-gray-100">{totalCandidates}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

const AnswerSheetCard: React.FC<{
  type: string
  seriesFrom?: string
  seriesTo?: string
  totalUsed: number
}> = ({ type, seriesFrom, seriesTo, totalUsed }) => {
  return (
    <div
      className="relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 overflow-hidden cursor-pointer"
      onClick={() => {
        window.location.hash = '#/answersheets'
      }}
      title="View detailed answer sheet records"
    >
      <div className="absolute -top-6 -right-8 w-24 h-24 bg-blue-500/10 border border-blue-200/40 rounded-full pointer-events-none" />
      <div className="px-4 py-3 text-xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center">
              <FileText className="w-4 h-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Answer Sheet Details</p>
              <p className="text-[11px] text-gray-500">Serial range & usage</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
            <CheckCircle2 className="w-3 h-3" aria-hidden />
            Verified
          </span>
        </div>
        <dl className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[11px] text-gray-500">Type</dt>
            <dd className="text-xs font-semibold text-gray-900 dark:text-gray-100">{type}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[11px] text-gray-500">Series</dt>
            <dd className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              {seriesFrom && seriesTo ? `${seriesFrom} – ${seriesTo}` : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[11px] text-gray-500">Total Used</dt>
            <dd className="text-xs font-semibold text-gray-900 dark:text-gray-100">{totalUsed || '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

const PackingCard: React.FC<{
  clothColor?: string
  inkColor?: string
  totalCandidates: number
  questionPaperPackets: number
}> = ({ clothColor, inkColor, totalCandidates, questionPaperPackets }) => {
  const answerSheetPackets = totalCandidates ? Math.max(1, Math.round(totalCandidates / 100)) : 0

  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-pink-200 overflow-hidden">
      <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-pink-500/10 border border-pink-200/40 rounded-full pointer-events-none" />
      <div className="px-4 py-3 text-xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center">
              <Package className="w-4 h-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Packing Details</p>
              <p className="text-[11px] text-gray-500">Cloth & ink colours</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" aria-hidden />
            Completed
          </span>
        </div>
        <dl className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[11px] text-gray-500">Cloth Colour</dt>
            <dd className="text-xs font-semibold text-gray-900 dark:text-gray-100">{clothColor || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[11px] text-gray-500">Ink Colour</dt>
            <dd className="text-xs font-semibold text-gray-900 dark:text-gray-100">{inkColor || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[11px] text-gray-500">Question Paper Packets</dt>
            <dd className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              {questionPaperPackets || '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[11px] text-gray-500">Answer Sheet Packets</dt>
            <dd className="text-xs font-semibold text-gray-900 dark:text-gray-100">{answerSheetPackets || '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

const StatusTracker: React.FC = () => {
  const items = [
    'Room Selection',
    'Room Allocation',
    'Seating Plan',
    'Invigilators Selection',
    'Duties Assigned',
  ]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-xs">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Status Tracker</span>
        </div>
        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">100% Complete</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 text-white" aria-hidden />
              </span>
              <span className="text-xs text-gray-800 dark:text-gray-200">{item}</span>
            </div>
            <Circle className="w-3 h-3 text-emerald-300" aria-hidden />
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <div className="w-full h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-emerald-500 to-emerald-600" />
        </div>
        <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium text-right">Ready for exam</p>
      </div>
    </div>
  )
}

const ClipboardListIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <rect x="5" y="7" width="14" height="14" rx="2" />
    <path d="M9 12h6M9 16h4" />
  </svg>
)

const TodaysExamControlPanel: React.FC<TodaysExamControlPanelProps> = ({
  data,
  isLoading,
}) => {
  const hasData = !!data && Array.isArray(data.exams) && data.exams.length > 0

  const {
    classXSummary,
    classXiiSummary,
    schoolRows,
    schoolTotalsMatch,
    totalCandidates,
    answerSheetAggregate,
    packingCloth,
    packingInk,
    dutiesCount,
    dutiesByType,
    questionPaperPackets,
  } = useMemo(() => {
    if (!hasData) {
      return {
        primaryExam: undefined,
        dateLabel: '',
        classXSummary: aggregateClassSummary([], 'X'),
        classXiiSummary: aggregateClassSummary([], 'XII'),
        schoolRows: [] as SchoolRow[],
        schoolTotalsMatch: true,
        totalCandidates: 0,
        answerSheetAggregate: aggregateAnswerSheets([]),
        packingCloth: '',
        packingInk: '',
        dutiesCount: 0,
        dutiesByType: {},
        questionPaperPackets: 0,
      }
    }

    const exams = [...data!.exams].sort((a, b) => {
      const aStart = a.timeSlot?.start || ''
      const bStart = b.timeSlot?.start || ''
      return aStart.localeCompare(bStart)
    })
    const primary = exams[0]

    const date = data!.examDate
      ? new Date(data!.examDate + 'T12:00:00').toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : ''

    const classX = aggregateClassSummary(exams, 'X')
    const classXii = aggregateClassSummary(exams, 'XII')

    const schoolRowsLocal = buildSchoolRows(exams)
    const schoolsTotal = schoolRowsLocal.reduce((sum, row) => sum + row.total, 0)
    const totalCandidatesLocal = data!.totalCandidates ?? exams.reduce((sum, e) => sum + (e.candidateCount || 0), 0)
    const totalsMatch = schoolsTotal === 0 || schoolsTotal === totalCandidatesLocal

    const answerSheets = exams.flatMap((e) => e.answerSheetDetails || [])
    const answerAgg = aggregateAnswerSheets(answerSheets)

    let packingClothLocal = data!.packing?.clothColor || ''
    let packingInkLocal = data!.packing?.marker || ''

    const primaryClassKey = normalizeClassKey(primary?.class)

    if (data!.packing) {
      if (primaryClassKey === 'X') {
        packingClothLocal = data!.packing.clothColorClass10 || packingClothLocal
        packingInkLocal = data!.packing.markerClass10 || packingInkLocal
      } else if (primaryClassKey === 'XII') {
        packingClothLocal = data!.packing.clothColorClass12 || packingClothLocal
        packingInkLocal = data!.packing.markerClass12 || packingInkLocal
      }
    }

    const questionPaperPacketsLocal = exams.length
    const dutiesLocal = data!.dutiesAssignedCount ?? 0
    const dutiesByTypeLocal = data!.dutiesByType || {}

    return {
      primaryExam: primary,
      dateLabel: date,
      classXSummary: classX,
      classXiiSummary: classXii,
      schoolRows: schoolRowsLocal,
      schoolTotalsMatch: totalsMatch,
      totalCandidates: totalCandidatesLocal,
      answerSheetAggregate: answerAgg,
      packingCloth: packingClothLocal,
      packingInk: packingInkLocal,
      dutiesCount: dutiesLocal,
      dutiesByType: dutiesByTypeLocal,
      questionPaperPackets: questionPaperPacketsLocal,
    }
  }, [data, hasData])

  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        <div className="h-14 rounded-xl bg-white/60 dark:bg-gray-800/60 border border-gray-200/70 animate-pulse" />
        <div className="h-10 rounded-xl bg-white/60 dark:bg-gray-800/60 border border-gray-200/70 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/60 dark:bg-gray-800/60 border border-gray-200/70 animate-pulse" />
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-dashed border-gray-300 dark:border-gray-600 px-4 py-6 text-center text-sm text-gray-500">
        No exams scheduled for today.
      </div>
    )
  }

  return (
    <section className="mt-1 space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT SIDE */}
        <div className="lg:col-span-8 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Candidate Details
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ClassCard summary={classXSummary} accent="orange" />
              <ClassCard summary={classXiiSummary} accent="purple" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnswerSheetCard
              type={answerSheetAggregate.type}
              seriesFrom={answerSheetAggregate.seriesFrom}
              seriesTo={answerSheetAggregate.seriesTo}
              totalUsed={answerSheetAggregate.totalUsed}
            />
            <PackingCard
              clothColor={packingCloth}
              inkColor={packingInk}
              totalCandidates={totalCandidates}
              questionPaperPackets={questionPaperPackets}
            />
          </div>
          <SchoolTable rows={schoolRows} totalCandidates={totalCandidates} totalsMatch={schoolTotalsMatch} />
        </div>

        {/* RIGHT SIDE */}
        <div className="lg:col-span-4 space-y-4">
          <DutiesSummaryCard assigned={dutiesCount} byType={dutiesByType} />
          <StatusTracker />
        </div>
      </div>
    </section>
  )
}

export default TodaysExamControlPanel

