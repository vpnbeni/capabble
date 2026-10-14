import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, CalendarCheck, Grid3x3, UserRound, UserX, Users } from 'lucide-react'
import { MonthSwitcher } from '@/components/attnd/MonthSwitcher'
import { Button, Card, EmptyState, Page, StatCard, cx } from '@/components/ui'
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

/** Five steps of one hue: none, then quarters of the busiest cell. */
const heatLevel = (count: number, max: number) => {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))
}

const HEAT_STEPS = [
  'var(--surface-sunken)',
  'color-mix(in srgb, var(--chart-6) 14%, var(--surface))',
  'color-mix(in srgb, var(--chart-6) 32%, var(--surface))',
  'color-mix(in srgb, var(--chart-6) 58%, var(--surface))',
  'var(--chart-6)',
]

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

  const maxClassAbsent = useMemo(
    () => Math.max(0, ...classMatrix.flatMap((row) => row.sections.map((cell) => cell.monthAbsent))),
    [classMatrix]
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
        title="Class absences"
        subtitle="Absences this month by class and section. Darker cells mean more absences."
        action={
          <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/attnd/student-attendance')}>
            Mark student attendance
          </Button>
        }
        footer={
          classMatrix.length ? (
            <span className="attnd-scale">
              Fewer
              <span className="attnd-scale__steps" aria-hidden="true">
                {HEAT_STEPS.map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </span>
              More absences · small figure is today's count
            </span>
          ) : undefined
        }
      >
        {classMatrix.length === 0 ? (
          <EmptyState
            compact
            icon={Grid3x3}
            title="No class attendance this month"
            body="Absences appear here once student attendance is saved."
          />
        ) : (
          <div className="attnd-heat-scroll">
            <table className="attnd-heat">
              <thead>
                <tr>
                  <th scope="col" className="is-row">
                    Class
                  </th>
                  {sections.map((section) => (
                    <th key={section} scope="col">
                      {section}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classMatrix.map((row) => (
                  <tr key={row.className}>
                    <th scope="row" className="is-row">
                      {row.className}
                    </th>
                    {sections.map((section) => {
                      const cell = row.sections.find((item) => item.section === section)
                      if (!cell) {
                        return (
                          <td key={section}>
                            <span className="attnd-heat__none" aria-label="No section">
                              —
                            </span>
                          </td>
                        )
                      }
                      const level = heatLevel(cell.monthAbsent, maxClassAbsent)
                      return (
                        <td key={section}>
                          <div
                            className={cx('attnd-heat__cell', level > 0 && `is-l${level}`)}
                            title={`${row.className} ${section}: ${cell.monthAbsent} absences this month · ${cell.todayAbsent} absent today · ${cell.todayHalfDay} half day today`}
                          >
                            <span className="attnd-heat__value">{formatCount(cell.monthAbsent)}</span>
                            <span className="attnd-heat__sub">today {formatCount(cell.todayAbsent)}</span>
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
