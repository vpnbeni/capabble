import React, { useMemo, useState, useEffect } from 'react'
import { useTimetable, WEEKDAYS, type TimetableClass } from '@/contexts/TimetableContext'
import bellTimingsService, { type BellTimingRowPayload } from '@/services/bellTimingsService'
import timetableService, { type TimetableVersionSummary, type TimetableGridState } from '@/services/timetableService'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { BookOpen, CalendarClock, FileDown, Search, UserCheck, Users } from 'lucide-react'
import { Avatar, Badge, Button, Card, EmptyState, FilterBar, Page, Select, StatCard } from '@/components/ui'
import '@/components/timetable/teacherwise.css'

/* ══════════════════════════════ Types ══════════════════════════════ */

/** A single entry in a teacher's schedule */
interface TeacherSlot {
  classId: string
  className: string
  section: string
  subject: string
}

/** Full schedule for one teacher: day → period slot → entry */
type TeacherSchedule = Record<string, Record<number, TeacherSlot>>

/** Aggregated teacher info for display */
interface TeacherInfo {
  name: string
  schedule: TeacherSchedule
  totalPeriods: number
  uniqueClasses: string[]     // "10-A", "10-B" etc
  uniqueSubjects: string[]
}

/* ══════════════════════════════ Helpers ══════════════════════════════ */

const SHORT_DAYS: Record<string, string> = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED',
  Thursday: 'THU', Friday: 'FRI', Saturday: 'SAT',
}

/**
 * Stable identity tint per class, drawn from the chart palette (--chart-1..6) in
 * teacherwise.css. The first class seen gets tint 1, the next tint 2, and so on.
 */
const CLASS_TINTS: Record<string, number> = {}
const TINT_COUNT = 6
let _colorIdx = 0
const getClassTint = (classKey: string) => {
  if (CLASS_TINTS[classKey] == null) {
    CLASS_TINTS[classKey] = (_colorIdx % TINT_COUNT) + 1
    _colorIdx++
  }
  return `ttw-tint--c${CLASS_TINTS[classKey]}`
}

const FALLBACK_START_MINUTES = 8 * 60

const parseTimeToMinutes = (value: string): number => {
  const [hoursRaw, minutesRaw] = String(value || '').split(':')
  const hours = Number.parseInt(hoursRaw, 10)
  const minutes = Number.parseInt(minutesRaw, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return FALLBACK_START_MINUTES
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return FALLBACK_START_MINUTES
  return hours * 60 + minutes
}

const formatMinutesTo12Hour = (value: number): string => {
  const normalized = ((value % 1440) + 1440) % 1440
  const hours24 = Math.floor(normalized / 60)
  const minutes = String(normalized % 60).padStart(2, '0')
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24
  return `${String(hours12).padStart(2, '0')}:${minutes} ${suffix}`
}

const buildPeriodTimeRanges = (startTime: string, rows: BellTimingRowPayload[]): string[] => {
  let cursor = parseTimeToMinutes(startTime)
  const periodRanges: string[] = []

  rows.forEach((row) => {
    const duration = Number.isFinite(row.duration) && row.duration > 0
      ? row.duration
      : row.type === 'break'
        ? 15
        : 40
    const from = cursor
    const to = cursor + duration

    if (row.type === 'period') {
      periodRanges.push(`${formatMinutesTo12Hour(from)} - ${formatMinutesTo12Hour(to)}`)
    }

    cursor = to
  })

  return periodRanges
}

/* ══════════════════════════════ Component ══════════════════════════════ */

const TeacherWise: React.FC = () => {
  const {
    classes,
    teachers,
    periodsPerDay,
    timetableGrid,
  } = useTimetable()

  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [periodTimeRanges, setPeriodTimeRanges] = useState<string[]>([])

  // ── Version state ──
  const [versions, setVersions] = useState<TimetableVersionSummary[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [versionGrid, setVersionGrid] = useState<TimetableGridState | null>(null)
  const [exportingPDF, setExportingPDF] = useState(false)

  useEffect(() => {
    timetableService.getVersions().then(setVersions).catch(() => setVersions([]))
  }, [])

  useEffect(() => {
    if (!selectedVersionId) { setVersionGrid(null); return }
    timetableService.getVersion(selectedVersionId)
      .then((v) => setVersionGrid(v.grid ?? null))
      .catch(() => { setVersionGrid(null); toast.error('Failed to load version.') })
  }, [selectedVersionId])

  // The active grid: version when selected, otherwise context grid
  const activeGrid = (versionGrid ?? timetableGrid) as TimetableGridState

  const handleExportTeacherPDF = async (teacherName: string) => {
    if (!selectedVersionId) { toast.error('Select a version first.'); return }
    const teacher = teachers.find((t) => t.name === teacherName)
    if (!teacher) return
    setExportingPDF(true)
    try { await timetableService.exportTeacherPDF(selectedVersionId, teacher.id) }
    catch { toast.error('PDF export failed.') }
    finally { setExportingPDF(false) }
  }

  // Build a class lookup
  const classMap = useMemo(() => {
    const map = new Map<string, TimetableClass>()
    classes.forEach((c) => map.set(c.id, c))
    return map
  }, [classes])

  // Period slots array
  const periodSlots = useMemo(
    () => Array.from({ length: periodsPerDay }, (_, i) => i),
    [periodsPerDay]
  )

  const periodHeaderTimes = useMemo(
    () => periodSlots.map((slot) => periodTimeRanges[slot] || '-'),
    [periodSlots, periodTimeRanges]
  )

  useEffect(() => {
    let isMounted = true

    const loadBellTimings = async () => {
      try {
        const saved = await bellTimingsService.getBellTimings()
        if (!isMounted) return
        setPeriodTimeRanges(buildPeriodTimeRanges(saved.startTime, saved.rows))
      } catch {
        if (!isMounted) return
        setPeriodTimeRanges([])
      }
    }

    void loadBellTimings()

    return () => {
      isMounted = false
    }
  }, [])

  // Derive teacher schedules from the active grid (version or manual)
  const teacherInfos: TeacherInfo[] = useMemo(() => {
    const map = new Map<string, { schedule: TeacherSchedule; classSet: Set<string>; subjectSet: Set<string>; count: number }>()

    // Scan all grid cells
    for (const classId of Object.keys(activeGrid)) {
      const cls = classMap.get(classId)
      if (!cls) continue
      const classDays = (activeGrid as Record<string, Record<string, Record<number, { subject: string; teacher: string }>>>)[classId]
      for (const day of Object.keys(classDays)) {
        const slots = classDays[day]
        for (const slotStr of Object.keys(slots)) {
          const slot = Number(slotStr)
          const cell = slots[slot]
          if (!cell.teacher) continue

          const tName = cell.teacher
          if (!map.has(tName)) {
            map.set(tName, { schedule: {}, classSet: new Set(), subjectSet: new Set(), count: 0 })
          }
          const entry = map.get(tName)!
          if (!entry.schedule[day]) entry.schedule[day] = {}
          entry.schedule[day][slot] = {
            classId,
            className: cls.className,
            section: cls.section,
            subject: cell.subject,
          }
          entry.classSet.add(`${cls.className}-${cls.section}`)
          if (cell.subject) entry.subjectSet.add(cell.subject)
          entry.count++
        }
      }
    }

    // Also include teachers from the teachers list that have no assignments
    for (const t of teachers) {
      if (!map.has(t.name)) {
        map.set(t.name, { schedule: {}, classSet: new Set(), subjectSet: new Set(), count: 0 })
      }
    }

    // Convert to sorted array
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        schedule: data.schedule,
        totalPeriods: data.count,
        uniqueClasses: Array.from(data.classSet).sort(),
        uniqueSubjects: Array.from(data.subjectSet).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activeGrid, classMap, teachers])

  // Filter by search
  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teacherInfos
    const q = searchQuery.toLowerCase()
    return teacherInfos.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.uniqueSubjects.some((s) => s.toLowerCase().includes(q)) ||
        t.uniqueClasses.some((c) => c.toLowerCase().includes(q))
    )
  }, [teacherInfos, searchQuery])

  // Overall stats
  const overallStats = useMemo(() => ({
    totalTeachers: teacherInfos.length,
    assignedTeachers: teacherInfos.filter((t) => t.totalPeriods > 0).length,
    totalAssignments: teacherInfos.reduce((s, t) => s + t.totalPeriods, 0),
  }), [teacherInfos])

  const versionOptions = useMemo(
    () => [
      { value: '', label: 'Manual (current grid)' },
      ...versions.map((v) => ({ value: v._id, label: `${v.name} [${v.status}]` })),
    ],
    [versions]
  )

  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

  return (
    <Page width="full">
      <div className="cb-stack">
        {/* ── Summary ── */}
        {teacherInfos.length > 0 && (
          <section className="cb-stats ttw-stats" aria-label="Teacher schedule summary">
            <StatCard label="Teachers" value={overallStats.totalTeachers} icon={Users} />
            <StatCard
              label="Assigned"
              value={overallStats.assignedTeachers}
              icon={UserCheck}
              hint="Teachers with at least one period"
            />
            <StatCard label="Total periods" value={overallStats.totalAssignments} icon={CalendarClock} />
          </section>
        )}

        {/* ── Toolbar: search + version ── */}
        <Card flush>
          <div className="ttw-toolbar">
            <p className="ttw-toolbar__note">
              Each teacher's weekly schedule, built from the class-wise timetable assignments.
            </p>
            <FilterBar
              search={{
                placeholder: 'Search teacher, subject or class',
                value: searchQuery,
                onChange: setSearchQuery,
                label: 'Search teachers',
              }}
              filters={
                <Select
                  aria-label="Timetable version"
                  title="Select a generated timetable version to view"
                  size="sm"
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  options={versionOptions}
                  className="ttw-version"
                />
              }
              actions={
                exportingPDF ? (
                  <Badge tone="info">Exporting PDF…</Badge>
                ) : null
              }
            />
          </div>
        </Card>

        {/* ── Empty: no teachers and no assignments ── */}
        {teacherInfos.length === 0 && (
          <Card>
            <EmptyState
              icon={Users}
              title="No teacher schedules yet"
              body="Schedules appear here once teachers are assigned to periods on the class-wise timetable."
              action={
                <Button variant="primary" onClick={() => navigate('/time-table/class-wise')}>
                  Open class-wise timetable
                </Button>
              }
            />
          </Card>
        )}

        {/* ── No results from search ── */}
        {teacherInfos.length > 0 && filteredTeachers.length === 0 && (
          <Card>
            <EmptyState
              icon={Search}
              title={`No teachers match "${searchQuery}"`}
              body="Try a teacher name, subject or class such as 10-A."
              action={
                <Button variant="tertiary" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              }
            />
          </Card>
        )}

        {/* ── Teacher cards ── */}
        {filteredTeachers.map((teacher) => {
          const maxSlots = periodsPerDay * WEEKDAYS.length
          const freeSlots = maxSlots - teacher.totalPeriods

          return (
            <Card
              key={teacher.name}
              flush
              className="ttw-teacher-card"
              title={
                <span className="ttw-teacher-title">
                  <Avatar name={teacher.name} size="sm" />
                  <span className="ttw-teacher-title__name">{teacher.name}</span>
                </span>
              }
              subtitle={teacher.uniqueSubjects.length > 0 ? teacher.uniqueSubjects.join(', ') : undefined}
              action={
                <div className="ttw-teacher-meta">
                  <Badge tone="accent">{plural(teacher.totalPeriods, 'period', 'periods')}</Badge>
                  {freeSlots > 0 && <Badge tone="success">{freeSlots} free</Badge>}
                  {teacher.uniqueClasses.length > 0 && (
                    <Badge tone="neutral">{plural(teacher.uniqueClasses.length, 'class', 'classes')}</Badge>
                  )}
                  {selectedVersionId && (
                    <Button
                      size="sm"
                      icon={FileDown}
                      onClick={() => handleExportTeacherPDF(teacher.name)}
                      disabled={exportingPDF}
                    >
                      Export PDF
                    </Button>
                  )}
                </div>
              }
            >
              {/* Grid or no-assignment notice */}
              {teacher.totalPeriods === 0 ? (
                <EmptyState
                  compact
                  icon={BookOpen}
                  title="No periods assigned yet"
                  body="Assign this teacher to a period on the class-wise timetable to see their week here."
                />
              ) : (
                <div className="ttw-grid-scroll">
                  <table className="ttw-grid">
                    <thead>
                      <tr>
                        <th scope="col" className="ttw-grid__day">Day</th>
                        {periodSlots.map((slot) => (
                          <th key={slot} scope="col">Period {slot + 1}</th>
                        ))}
                      </tr>
                      <tr className="ttw-grid__time">
                        <th scope="col" className="ttw-grid__day">Time</th>
                        {periodSlots.map((slot) => (
                          <th key={`period-time-${slot}`}>{periodHeaderTimes[slot]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {WEEKDAYS.map((day) => (
                        <tr key={day}>
                          <th scope="row" className="ttw-grid__day" title={day}>{SHORT_DAYS[day]}</th>
                          {periodSlots.map((slot) => {
                            const entry = teacher.schedule[day]?.[slot]
                            if (!entry) {
                              return (
                                <td key={slot}>
                                  <span className="ttw-free">
                                    <Badge tone="success" dot={false}>Free</Badge>
                                  </span>
                                </td>
                              )
                            }
                            const classKey = `${entry.className}-${entry.section}`
                            return (
                              <td key={slot}>
                                <div className={`ttw-slot ${getClassTint(classKey)}`} title={`${classKey} · ${entry.subject}`}>
                                  <span className="ttw-slot__class">{classKey}</span>
                                  {entry.subject ? <span className="ttw-slot__subject">{entry.subject}</span> : null}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </Page>
  )
}

export default TeacherWise
