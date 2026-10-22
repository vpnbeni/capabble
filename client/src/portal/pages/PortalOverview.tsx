import React, { useMemo } from 'react'
import { classLabel } from '@/utils/classLabel'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarDays } from 'lucide-react'
import { Button, Card, EmptyState, Page, PageHeader, StatCard, formatDate, formatINR, formatTime } from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalAttendance, usePortalFees, usePortalNotices, usePortalResults, usePortalTimetable } from '../usePortal'
import { monthKey, NoChild } from './shared'
import { PortalComingUp } from './PortalCalendar'

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/** Home: this month's attendance, dues, latest result, today's periods and recent notices. */
const PortalOverview: React.FC = () => {
  const navigate = useNavigate()
  const { child, isParent, has } = usePortal()
  const id = child?.studentId
  const month = monthKey()

  const attendance = usePortalAttendance(id, month, has('attendance'))
  const fees = usePortalFees(id, isParent && has('fees'))
  const results = usePortalResults(id, has('results'))
  const timetable = usePortalTimetable(id, has('timetable'))
  const notices = usePortalNotices(has('notices'))

  const today = useMemo(() => {
    const data = timetable.data
    if (!data) return null
    const dayName = DAY_NAMES[new Date().getDay()]
    const day = data.days.find((entry) => entry.name === dayName)
    if (!day) return []
    return data.periods
      .map((period, index) => ({ period, slot: day.slots[index] }))
      .filter(({ period, slot }) => !period.isBreak && slot?.subject)
  }, [timetable.data])

  if (!child) return <Page><NoChild /></Page>

  const latest = results.data?.[results.data.length - 1]
  const summary = attendance.data?.summary
  const firstName = child.name.split(' ')[0]

  return (
    <Page>
      <PageHeader
        title={isParent ? `${firstName}'s school day` : `Hello, ${firstName}`}
        subtitle={`${classLabel(child.className, child.section)} · Admission no. ${child.rollNumber}`}
      />

      <div className="cb-stats">
        {has('attendance') ? (
          <StatCard
            label="Attendance this month"
            value={summary?.percentage != null ? `${summary.percentage}%` : '—'}
            hint={summary ? `${summary.absent} absent of ${summary.schoolDays} school days` : undefined}
          />
        ) : null}
        {isParent && has('fees') ? (
          <StatCard
            label="Fees due"
            value={fees.data ? formatINR(fees.data.totals.balance) : '—'}
            hint={fees.data && fees.data.totals.balance > 0 ? 'Pay at the school office' : 'Nothing due'}
          />
        ) : null}
        {has('results') ? (
          <StatCard
            label={latest ? latest.examName : 'Latest result'}
            value={latest ? `${latest.percentage}%` : '—'}
            hint={latest ? `Grade ${latest.grade || '—'}` : 'No results published yet'}
          />
        ) : null}
      </div>

      <div className="cb-grid-6-6">
        {has('calendar') ? <PortalComingUp /> : null}
        {has('timetable') ? (
          <Card
            title="Today's periods"
            action={<Button size="sm" variant="tertiary" onClick={() => navigate('/portal/timetable')}>Full timetable</Button>}
          >
            {today && today.length > 0 ? (
              <ul className="pt-periods">
                {today.map(({ period, slot }) => (
                  <li key={period.id}>
                    <span>{slot?.subject}</span>
                    <span className="pt-periods__time">{formatTime(period.startTime)}–{formatTime(period.endTime)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarDays} title="No periods today" body={timetable.data === null ? 'The timetable is not published yet.' : undefined} compact />
            )}
          </Card>
        ) : null}
        {has('notices') ? (
          <Card
            title="Notices"
            action={<Button size="sm" variant="tertiary" onClick={() => navigate('/portal/notices')}>All notices</Button>}
          >
            {notices.data && notices.data.length > 0 ? (
              <ul className="pt-periods">
                {notices.data.slice(0, 4).map((notice) => (
                  <li key={notice._id}>
                    <button type="button" className="cb-link" onClick={() => navigate(`/portal/notices/${notice._id}`)}>
                      {notice.title}
                    </button>
                    <span className="pt-periods__time">{formatDate(notice.circularDate, { year: false })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Bell} title="No notices yet" compact />
            )}
          </Card>
        ) : null}
      </div>
    </Page>
  )
}

export default PortalOverview
