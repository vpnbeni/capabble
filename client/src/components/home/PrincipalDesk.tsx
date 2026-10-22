import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  UserRound,
  Users,
} from 'lucide-react'
import { Badge, Button, Card, DataTable, EmptyState, Entity, HoverCard, Icon, Ring, ColumnChart, formatTime, type DataTableColumn } from '@/components/ui'
import attndService, { type AttndAbsentStudent } from '@/services/attndService'
import appntService, { type Appointment } from '@/services/appntService'
import { usePermissions } from '@/hooks/usePermissions'
import { isFeatureEnabledForPath } from '@/constants/featureAccess'
import { STATUS_META } from '@/components/appnt/AppntUi'
import { formatCount } from '@/components/students/studentFormat'
import type { QuickAction } from './quickActions'
import { MonthGlanceCard, MyCalendarCard } from '@/components/calendar/MyCalendarCards'

const pad = (n: number) => String(n).padStart(2, '0')
const todayKey = () => {
  const today = new Date()
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
}
const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0)

const DeskMetric: React.FC<{
  icon: typeof Users
  tone: 'blue' | 'green' | 'orange' | 'violet'
  label: string
  value: string
  detail: string
  onClick?: () => void
}> = ({ icon, tone, label, value, detail, onClick }) => (
  <button type="button" className={`principal-metric principal-metric--${tone}`} onClick={onClick}>
    <span className="principal-metric__icon"><Icon icon={icon} size={21} /></span>
    <span className="principal-metric__body">
      <span className="principal-metric__label">{label}</span>
      <strong className="principal-metric__value is-num">{value}</strong>
      <span className="principal-metric__detail">{detail}</span>
    </span>
    {onClick ? <Icon icon={ArrowRight} size={18} className="principal-metric__arrow" /> : null}
  </button>
)

const ABSENT_PREVIEW = 8

/** Hover card body: who is absent, each name to the student's profile, and a link to the register. */
const AbsentList: React.FC<{
  title: string
  students: AttndAbsentStudent[]
  showClass: boolean
  profileLinks: boolean
  footer: { label: string; to: string }
}> = ({ title, students, showClass, profileLinks, footer }) => (
  <>
    <p className="cb-hovercard__title">{title}</p>
    {students.length ? (
      <ul className="cb-hovercard__list">
        {students.slice(0, ABSENT_PREVIEW).map((student) => {
          const meta = [showClass ? `${student.className} ${student.section}` : `Section ${student.section}`, student.rollNumber ? `Roll ${student.rollNumber}` : '']
            .filter(Boolean).join(' · ')
          const body = (
            <>
              <span className="cb-hovercard__row-main"><strong>{student.name}</strong><span>{meta}</span></span>
              {student.halfDay ? <Badge tone="warning">Half day</Badge> : null}
            </>
          )
          return (
            <li key={student.studentId}>
              {profileLinks
                ? <Link className="cb-hovercard__row" to={`/stdnt/students/${student.studentId}`}>{body}</Link>
                : <div className="cb-hovercard__row">{body}</div>}
            </li>
          )
        })}
      </ul>
    ) : <p className="cb-hovercard__more">Names are not available for your role.</p>}
    {students.length > ABSENT_PREVIEW ? <p className="cb-hovercard__more">and {formatCount(students.length - ABSENT_PREVIEW)} more</p> : null}
    <div className="cb-hovercard__footer">
      <Link to={footer.to} className="cb-link">{footer.label} →</Link>
    </div>
  </>
)

export const PrincipalDesk: React.FC<{ actions: QuickAction[]; onEditActions: () => void }> = ({ actions, onEditActions }) => {
  const navigate = useNavigate()
  const date = todayKey()
  const attendance = useQuery({
    queryKey: ['principal-desk', 'attendance', date],
    queryFn: () => attndService.getDashboard(date.slice(0, 7), date),
    staleTime: 60_000,
  })
  const { access } = usePermissions()
  const appointmentsOn = isFeatureEnabledForPath('/appnt/today', access)
  const profileLinks = isFeatureEnabledForPath('/stdnt/students', access)
  const appointments = useQuery({
    queryKey: ['appnt', 'today', date],
    queryFn: () => appntService.today(date),
    enabled: appointmentsOn,
    staleTime: 60_000,
  })
  const appt = appointments.data
  const upcomingToday = (appt?.items || []).filter((a) => ['confirmed', 'checked_in', 'requested'].includes(a.status))
  const pendingRequests = appt?.pendingRequests || 0
  const appointmentColumns: DataTableColumn<Appointment>[] = [
    { key: 'time', header: 'Time', width: 84, mobile: 'subtitle', render: (a) => <span className="is-num">{formatTime(a.startTime)}</span> },
    { key: 'visitor', header: 'Visitor', mobile: 'title', render: (a) => <Entity primary={a.visitor.name} secondary={appt?.isHostView ? a.purpose : `with ${a.hostName}`} /> },
    { key: 'status', header: 'Status', mobile: 'aside', render: (a) => <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge> },
  ]
  const students = attendance.data?.students
  const staff = attendance.data?.staff
  const attendanceRate = students ? rate(students.todayPresent, students.strength) : 0
  const classAttendance = (attendance.data?.classMatrix || []).map((row) => {
    const strength = row.sections.reduce((sum, section) => sum + section.strength, 0)
    const absent = row.sections.reduce((sum, section) => sum + section.todayAbsent, 0)
    const halfDay = row.sections.reduce((sum, section) => sum + section.todayHalfDay, 0)
    const sections = row.sections.filter((section) => section.todayAbsent || section.todayHalfDay).map((section) => section.section)
    return { className: row.className, strength, absent, halfDay, sections, rate: strength ? Math.max(0, rate(strength - absent - halfDay * .5, strength)) : 0 }
  }).filter((item) => item.strength > 0)
  const absentStudents = attendance.data?.studentsAbsentToday || []
  const month = date.slice(0, 7)
  const registerPath = (className: string, sections: string[]) =>
    `/attnd/student-attendance?${new URLSearchParams({ class: className, ...(sections.length === 1 ? { section: sections[0] } : {}), month })}`
  const absentRate = students ? rate(students.todayAbsent, students.strength) : 0
  const halfDayRate = students ? rate(students.todayHalfDay, students.strength) : 0
  return (
    <div className="principal-desk">
      <section className="principal-metrics" aria-label="Today's school overview">
        <DeskMetric
          icon={Users}
          tone="blue"
          label="Student attendance"
          value={attendance.isLoading ? '…' : `${attendanceRate}%`}
          detail={students ? `${formatCount(students.todayPresent)} / ${formatCount(students.strength)} present` : 'Loading attendance'}
          onClick={() => navigate('/attnd/attndboard')}
        />
        <DeskMetric
          icon={UserRound}
          tone="green"
          label="Teachers on leave"
          value={attendance.isLoading ? '…' : formatCount(staff?.todayAbsent || 0)}
          detail={staff ? `Of ${formatCount(staff.strength)} staff · marked absent today` : 'Loading staff attendance'}
          onClick={() => navigate('/attnd/staff-attendance')}
        />
        {appointmentsOn ? (
          <DeskMetric
            icon={CalendarDays}
            tone="orange"
            label="Appointments today"
            value={appointments.isLoading ? '…' : formatCount(appt?.total || 0)}
            detail={appt?.next ? `Next ${formatTime(appt.next.startTime)} · ${appt.next.visitorName}` : appt?.total ? 'No more today' : 'No appointments scheduled'}
            onClick={() => navigate('/appnt/today')}
          />
        ) : (
          <DeskMetric icon={CalendarDays} tone="orange" label="Appointments today" value="—" detail="Appointments are not set up" />
        )}
        <DeskMetric
          icon={ClipboardCheck}
          tone="violet"
          label="Pending approvals"
          value={formatCount(pendingRequests)}
          detail={pendingRequests ? `Meeting ${pendingRequests === 1 ? 'request' : 'requests'} to answer` : 'Leave, bills and other requests'}
          onClick={pendingRequests ? () => navigate('/appnt/appointments?status=requested') : undefined}
        />
      </section>

      <section className="principal-main">
        <Card
          bodyClassName="principal-overview"
          title="Student attendance overview"
          subtitle={students ? `${formatCount(students.strength)} students · live for today` : 'Live attendance status for today.'}
          action={<Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/attnd/attndboard')}>View details</Button>}
        >
          {attendance.isLoading ? <div className="cb-table-state"><span className="cb-spinner" /> Loading attendance</div> : students ? (
            <div className="principal-attendance">
              <Ring
                label={`${attendanceRate}% of students present today`}
                segments={[
                  { value: students.todayPresent, tone: 'success' },
                  { value: students.todayHalfDay, tone: 'warning' },
                  { value: students.todayAbsent, tone: 'danger' },
                ]}
                max={students.strength || 1}
              >
                <strong className="principal-attendance__figure is-num">{attendanceRate}%</strong>
                <span className="principal-attendance__caption">present</span>
              </Ring>
              <ul className="principal-attendance__legend">
                {[
                  { label: 'Present', count: students.todayPresent, share: attendanceRate, tone: 'success' },
                  { label: 'Half day', count: students.todayHalfDay, share: halfDayRate, tone: 'warning' },
                  { label: 'Absent', count: students.todayAbsent, share: absentRate, tone: 'danger' },
                ].map((row) => {
                  const body = (
                    <>
                      <span className="principal-attendance__name"><span className={`principal-attendance__dot is-${row.tone}`} aria-hidden="true" />{row.label}</span>
                      <strong className="principal-attendance__count is-num">{formatCount(row.count)}</strong>
                      <span className="principal-attendance__share is-num">{row.share}% of students</span>
                    </>
                  )
                  const listed = row.tone === 'danger' ? absentStudents.filter((s) => !s.halfDay) : row.tone === 'warning' ? absentStudents.filter((s) => s.halfDay) : []
                  return (
                    <li key={row.label}>
                      {row.tone !== 'success' && row.count ? (
                        <HoverCard
                          className="principal-attendance__hover"
                          label={`${row.label} today: ${formatCount(row.count)} students`}
                          content={<AbsentList title={`${formatCount(row.count)} ${row.label.toLowerCase()} today`} students={listed} showClass profileLinks={profileLinks} footer={{ label: 'View attendance', to: '/attnd/attndboard' }} />}
                        >
                          {body}
                        </HoverCard>
                      ) : body}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : <EmptyState compact icon={Users} title="Attendance is not available" body="Mark attendance to see today’s school overview." />}
          {classAttendance.length ? (
            <div className="principal-classes">
              <p className="cb-subhead">By class <span className="cb-muted">· dashed line is the 95% target</span></p>
              <ColumnChart
                label={`Attendance by class today: ${classAttendance.map((item) => `${item.className} ${item.rate}%`).join(', ')}`}
                target={{ value: 95, label: '95% target' }}
                items={classAttendance.map((item) => ({
                  label: item.className,
                  value: item.rate,
                  caption: item.absent ? `${formatCount(item.absent)} absent` : undefined,
                  tone: item.rate >= 95 ? 'accent' : item.rate >= 90 ? 'warning' : 'danger',
                  ...(item.absent || item.halfDay ? {
                    detailLabel: `${item.className}: who is absent today`,
                    detail: (
                      <AbsentList
                        title={`${item.className} · ${[item.absent ? `${formatCount(item.absent)} absent` : '', item.halfDay ? `${formatCount(item.halfDay)} half day` : ''].filter(Boolean).join(', ')}`}
                        students={absentStudents.filter((s) => s.className === item.className)}
                        showClass={false}
                        profileLinks={profileLinks}
                        footer={{ label: `Open ${item.className} register`, to: registerPath(item.className, item.sections) }}
                      />
                    ),
                  } : {}),
                }))}
              />
            </div>
          ) : null}
        </Card>

        <MyCalendarCard title="Today and coming up" />
      </section>

      <section className="principal-queues">
        <Card
          title="Pending approvals"
          action={pendingRequests ? <Button variant="tertiary" size="sm" onClick={() => navigate('/appnt/appointments?status=requested')}>View all</Button> : undefined}
        >
          {pendingRequests ? (
            <p className="principal-queue-copy"><strong className="is-num">{formatCount(pendingRequests)}</strong> meeting {pendingRequests === 1 ? 'request is' : 'requests are'} waiting for an answer.</p>
          ) : <EmptyState compact icon={CheckCircle2} title="No approvals waiting" body="Leave, bill and other approval requests will appear here." />}
        </Card>
        <Card title="Teachers on leave" action={<Button variant="tertiary" size="sm" onClick={() => navigate('/attnd/staff-attendance')}>View attendance</Button>}>
          {staff?.todayAbsent ? <p className="principal-queue-copy"><strong className="is-num">{formatCount(staff.todayAbsent)}</strong> staff member{staff.todayAbsent === 1 ? '' : 's'} marked absent today.</p> : <EmptyState compact icon={UserRound} title="No staff marked absent" body="Staff attendance updates will show here." />}
        </Card>
        <Card
          title="Today's appointments"
          flush={upcomingToday.length > 0}
          action={appointmentsOn ? <Button variant="tertiary" size="sm" onClick={() => navigate('/appnt/today')}>View all</Button> : undefined}
        >
          {!appointmentsOn ? (
            <EmptyState compact icon={Clock3} title="Appointments are not set up" body="Ask your administrator to turn on Appointments for parent, visitor and staff meetings." />
          ) : upcomingToday.length ? (
            <DataTable
              caption="Today's appointments"
              columns={appointmentColumns}
              rows={upcomingToday.slice(0, 5)}
              getRowKey={(a) => a._id}
              onRowClick={() => navigate('/appnt/today')}
              density="compact"
            />
          ) : (
            <EmptyState compact icon={Clock3} title="No appointments today" body="Parent, visitor and staff appointments will appear here." />
          )}
        </Card>
      </section>

      <section className="principal-bottom">
        <MonthGlanceCard />
        <Card title="Quick actions" action={<Button variant="tertiary" size="sm" onClick={onEditActions}>Choose actions</Button>}>
          {actions.length ? <div className="principal-actions">{actions.slice(0, 6).map((action) => <button key={action.id} type="button" onClick={() => navigate(action.path)}><Icon icon={action.icon} size={18} /><span>{action.label}</span></button>)}</div> : <EmptyState compact icon={ClipboardCheck} title="No quick actions chosen" action={<Button size="sm" onClick={onEditActions}>Choose actions</Button>} />}
        </Card>
      </section>
    </div>
  )
}
