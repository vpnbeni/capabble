import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, CalendarCheck, Grid3x3, UserRound, UserX, Users } from 'lucide-react'
import { MonthSwitcher } from '@/components/attnd/MonthSwitcher'
import { Badge, Button, Card, EmptyState, Page, StatCard, cx } from '@/components/ui'
import { formatCount } from '@/components/students/studentFormat'
import attndService, { type AttndDashboardData } from '@/services/attndService'
import '@/components/attnd/attnd.css'

const currentMonthKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const currentDateKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const formatShortDate = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const emptyStats = {
  strength: 0,
  todayPresent: 0,
  todayAbsent: 0,
  todayHalfDay: 0,
  monthAbsent: 0,
  monthHalfDay: 0,
  attendancePercent: 0,
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** Attendance bands for a section this month. Thresholds are percentages of possible attendance. */
type Band = 'good' | 'watch' | 'concern' | 'none'
const BAND_GOOD = 95
const BAND_WATCH = 90
const BAND_LABEL: Record<Band, string> = { good: 'Good', watch: 'Watch', concern: 'Needs attention', none: 'No data' }

const sectionAttendance = (
  cell: { strength: number; monthAbsent: number; monthHalfDay: number },
  workingDays: number
) => {
  const possible = cell.strength * workingDays
  if (possible <= 0) return { rate: null as number | null, band: 'none' as Band }
  const missed = cell.monthAbsent + cell.monthHalfDay * 0.5
  const rate = Math.max(0, Math.round((1 - missed / possible) * 1000) / 10)
  const band: Band = rate >= BAND_GOOD ? 'good' : rate >= BAND_WATCH ? 'watch' : 'concern'
  return { rate, band }
}

const Attndboard: React.FC = () => {
  const navigate = useNavigate()
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AttndDashboardData | null>(null)

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)
      try {
        const payload = await attndService.getDashboard(selectedMonth, currentDateKey())
        setData(payload)
      } catch (error: any) {
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load Attndboard.'))
      } finally {
        setLoading(false)
      }
    }
    void loadDashboard()
  }, [selectedMonth])

  const sections = data?.sections || []
  const classMatrix = data?.classMatrix || []
  const staffMatrix = data?.staffMatrix || []
  const dailyTrend = data?.dailyTrend || []
  const staff = data?.staff || emptyStats
  const students = data?.students || emptyStats

  const workingDays = data?.workingDays || 0
  const classRows = useMemo(
    () =>
      classMatrix.map((row) => ({
        className: row.className,
        sections: sections
          .map((name) => row.sections.find((cell) => cell.section === name))
          .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell))
          .map((cell) => ({ ...cell, ...sectionAttendance(cell, workingDays) })),
      })),
    [classMatrix, sections, workingDays]
  )
  const bandCounts = useMemo(() => {
    const counts: Record<Band, number> = { good: 0, watch: 0, concern: 0, none: 0 }
    classRows.forEach((row) => row.sections.forEach((cell) => (counts[cell.band] += 1)))
    return counts
  }, [classRows])
  const sectionCount = classRows.reduce((sum, row) => sum + row.sections.length, 0)
  const absentTodayStudents = students.todayAbsent
  const openSection = (className: string, section: string) =>
    navigate(
      `/attnd/student-attendance?${new URLSearchParams({ class: className, section, month: selectedMonth }).toString()}`
    )
  const maxStaffAbsent = useMemo(() => Math.max(0, ...staffMatrix.map((row) => row.monthAbsent)), [staffMatrix])
  const maxTrend = useMemo(
    () => Math.max(1, ...dailyTrend.map((item) => item.studentAbsent + item.staffAbsent)),
    [dailyTrend]
  )
  const trendTotal = dailyTrend.reduce((sum, item) => sum + item.studentAbsent + item.staffAbsent, 0)

  if (loading && !data) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the Attndboard
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <div className="attnd-boardbar">
        <p className="attnd-boardbar__text">
          Today is <strong>{formatDateLabel(data?.date || currentDateKey())}</strong> ·{' '}
          {formatCount(data?.workingDays || 0)} working days this month
        </p>
        <MonthSwitcher value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <section className="cb-stats" aria-label="Today's attendance">
        <StatCard
          label="Students present today"
          value={formatCount(students.todayPresent)}
          unit={`/ ${formatCount(students.strength)}`}
          icon={Users}
          hint={`${formatCount(students.todayAbsent)} absent · ${formatCount(students.todayHalfDay)} half day`}
          progress={percent(students.todayPresent, students.strength)}
          progressTone="success"
        />
        <StatCard
          label="Staff present today"
          value={formatCount(staff.todayPresent)}
          unit={`/ ${formatCount(staff.strength)}`}
          icon={UserRound}
          hint={`${formatCount(staff.todayAbsent)} absent · ${formatCount(staff.todayHalfDay)} half day`}
          progress={percent(staff.todayPresent, staff.strength)}
          progressTone="success"
        />
        <StatCard
          label="Student attendance this month"
          value={`${students.attendancePercent}%`}
          icon={CalendarCheck}
          hint={`${formatCount(students.monthAbsent)} absences · ${formatCount(students.monthHalfDay)} half days`}
          progress={students.attendancePercent}
        />
        <StatCard
          label="Staff attendance this month"
          value={`${staff.attendancePercent}%`}
          icon={CalendarCheck}
          hint={`${formatCount(staff.monthAbsent)} absences · ${formatCount(staff.monthHalfDay)} half days`}
          progress={staff.attendancePercent}
        />
      </section>

      <Card
        title="Attendance by class"
        subtitle={
          sectionCount === 0
            ? 'Each section\'s attendance this month.'
            : bandCounts.watch + bandCounts.concern === 0
              ? `All ${formatCount(sectionCount)} sections are at ${BAND_GOOD}% or better this month.`
              : `${formatCount(bandCounts.watch + bandCounts.concern)} of ${formatCount(sectionCount)} sections are below ${BAND_GOOD}% this month.`
        }
        action={
          <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/attnd/student-attendance')}>
            Mark student attendance
          </Button>
        }
        footer={
          sectionCount ? (
            <div className="attnd-bandkey">
              <span className="attnd-bandkey__item">
                <span className="attnd-bandkey__dot is-good" aria-hidden="true" />
                Good · {BAND_GOOD}% or more
              </span>
              <span className="attnd-bandkey__item">
                <span className="attnd-bandkey__dot is-watch" aria-hidden="true" />
                Watch · {BAND_WATCH}–{BAND_GOOD - 1}%
              </span>
              <span className="attnd-bandkey__item">
                <span className="attnd-bandkey__dot is-concern" aria-hidden="true" />
                Needs attention · below {BAND_WATCH}%
              </span>
            </div>
          ) : undefined
        }
      >
        {sectionCount === 0 ? (
          <EmptyState
            compact
            icon={Grid3x3}
            title="No class attendance this month"
            body="Sections appear here once students are added to classes."
          />
        ) : (
          <>
            <div className="attnd-bandsummary" aria-label="Sections by attendance">
              <Badge tone="success" size="lg">
                {formatCount(bandCounts.good)} good
              </Badge>
              <Badge tone="warning" size="lg">
                {formatCount(bandCounts.watch)} to watch
              </Badge>
              <Badge tone="danger" size="lg">
                {formatCount(bandCounts.concern)} need attention
              </Badge>
              <Badge tone={absentTodayStudents > 0 ? 'info' : 'neutral'} dot={false} size="lg">
                {absentTodayStudents > 0 ? `${formatCount(absentTodayStudents)} students absent today` : 'Nobody absent today'}
              </Badge>
            </div>
            <ul className="attnd-classes">
              {classRows.map((row) => (
                <li key={row.className} className="attnd-classes__row">
                  <span className="attnd-classes__name">{row.className}</span>
                  <ul className="attnd-classes__sections">
                    {row.sections.map((cell) => (
                      <li key={cell.section}>
                        <button
                        type="button"
                        className={cx('attnd-sec', `is-${cell.band}`)}
                        onClick={() => openSection(row.className, cell.section)}
                        aria-label={`Open attendance for ${row.className} ${cell.section}: ${cell.rate == null ? 'no students' : `${cell.rate}%`}, ${BAND_LABEL[cell.band]}`}
                        title={`${row.className} ${cell.section}: ${cell.rate == null ? 'no students' : `${cell.rate}% attendance`} · ${cell.monthAbsent} absences and ${cell.monthHalfDay} half days this month · ${cell.todayAbsent} absent today · ${cell.strength} students`}
                      >
                        <span className="attnd-sec__name">{cell.section}</span>
                        <span className="attnd-sec__rate">{cell.rate == null ? '—' : `${cell.rate}%`}</span>
                        <span className="attnd-sec__meta">
                          {cell.monthAbsent === 0 && cell.monthHalfDay === 0
                            ? 'No absences'
                            : `${formatCount(cell.monthAbsent)} absence${cell.monthAbsent === 1 ? '' : 's'}`}
                        </span>
                        {cell.todayAbsent > 0 ? (
                          <span className="attnd-sec__today">{formatCount(cell.todayAbsent)} absent today</span>
                        ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="cb-grid-6-6">
        <Card
          title="Staff absences by group"
          subtitle="Absences this month, compared with the busiest group."
          action={
            <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/attnd/staff-attendance')}>
              Mark staff attendance
            </Button>
          }
        >
          {staffMatrix.length === 0 ? (
            <EmptyState
              compact
              icon={UserX}
              title="No staff attendance this month"
              body="Absences appear here once staff attendance is saved."
            />
          ) : (
            <ul className="attnd-bars">
              {staffMatrix.map((row) => (
                <li key={row.group}>
                  <span className="attnd-bars__label" title={row.group}>
                    {row.group}
                  </span>
                  <span className="attnd-bars__track" aria-hidden="true">
                    <span
                      className="attnd-bars__fill"
                      style={{ width: `${maxStaffAbsent > 0 ? (row.monthAbsent / maxStaffAbsent) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="attnd-bars__value">{formatCount(row.monthAbsent)}</span>
                  <span className="attnd-bars__meta">
                    {formatCount(row.strength)} staff · {formatCount(row.todayAbsent)} absent today ·{' '}
                    {formatCount(row.monthHalfDay)} half days
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Daily absences"
          subtitle={`${formatCount(trendTotal)} student and staff absences this month.`}
        >
          {dailyTrend.length === 0 ? (
            <EmptyState compact icon={CalendarCheck} title="No days to show" />
          ) : (
            <div className="attnd-trend">
              <div className="attnd-trend__plot" role="list" aria-label="Absences per day">
                {dailyTrend.map((item) => {
                  const total = item.studentAbsent + item.staffAbsent
                  const day = Number(item.date.slice(-2))
                  const label = `${formatShortDate(item.date)}: ${
                    item.isSunday ? 'Sunday' : `${item.studentAbsent} students, ${item.staffAbsent} staff absent`
                  }`
                  return (
                    <div key={item.date} className="attnd-trend__col" role="listitem" tabIndex={0} aria-label={label}>
                      {item.isSunday ? (
                        <span className="attnd-trend__seg attnd-trend__seg--off" />
                      ) : total === 0 ? (
                        <span className="attnd-trend__seg attnd-trend__seg--zero" />
                      ) : (
                        <>
                          {item.staffAbsent > 0 ? (
                            <span
                              className="attnd-trend__seg attnd-trend__seg--staff"
                              style={{ height: `${(item.staffAbsent / maxTrend) * 100}%` }}
                            />
                          ) : null}
                          {item.studentAbsent > 0 ? (
                            <span
                              className="attnd-trend__seg attnd-trend__seg--students"
                              style={{ height: `${(item.studentAbsent / maxTrend) * 100}%` }}
                            />
                          ) : null}
                        </>
                      )}
                      {day === 1 || day % 5 === 0 ? <span className="attnd-trend__day">{day}</span> : null}
                      <span className="attnd-trend__tip" aria-hidden="true">
                        <strong>{formatShortDate(item.date)}</strong>
                        {item.isSunday ? (
                          'Sunday'
                        ) : (
                          <>
                            {formatCount(item.studentAbsent)} students · {formatCount(item.staffAbsent)} staff absent
                          </>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="attnd-trend__legend">
                <span>
                  <i style={{ background: 'var(--chart-1)' }} aria-hidden="true" />
                  Students
                </span>
                <span>
                  <i style={{ background: 'var(--chart-3)' }} aria-hidden="true" />
                  Staff
                </span>
                <span>
                  <i style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }} aria-hidden="true" />
                  Sunday
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Page>
  )
}

export default Attndboard
