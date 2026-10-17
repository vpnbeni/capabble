import React, { useMemo, useState } from 'react'
import { Card, MetricTile, MetricTiles, Page, PageHeader, TextField } from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalAttendance } from '../usePortal'
import { ATTENDANCE_LABEL, formatMonth, LoadFailed, monthKey, NoChild } from './shared'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Month calendar of absences, half days and holidays. Days without a mark count as present. */
const PortalAttendance: React.FC = () => {
  const { child } = usePortal()
  const [month, setMonth] = useState(monthKey())
  const { data, isLoading, isError } = usePortalAttendance(child?.studentId, month)

  // Monday-first grid: blanks before the 1st.
  const leading = useMemo(() => {
    const [year, m] = month.split('-').map(Number)
    return (new Date(year, m - 1, 1).getDay() + 6) % 7
  }, [month])

  if (!child) return <Page><NoChild /></Page>

  return (
    <Page>
      <PageHeader title="Attendance" subtitle={`${child.name} · ${formatMonth(month)}`} />
      <Card
        title={formatMonth(month)}
        action={
          <TextField
            aria-label="Month"
            type="month"
            size="sm"
            value={month}
            max={monthKey()}
            onChange={(event) => event.target.value && setMonth(event.target.value)}
          />
        }
      >
        {isError ? <LoadFailed what="Attendance" /> : null}
        {data ? (
          <div className="cb-stack">
            <MetricTiles>
              <MetricTile label="Attendance" value={data.summary.percentage != null ? `${data.summary.percentage}%` : '—'} />
              <MetricTile label="School days" value={data.summary.schoolDays} />
              <MetricTile label="Absent" value={data.summary.absent} tone={data.summary.absent > 0 ? 'danger' : undefined} />
              <MetricTile label="Half days" value={data.summary.halfDays} />
            </MetricTiles>
            <div className="pt-cal" role="grid" aria-label={`Attendance for ${formatMonth(month)}`}>
              {WEEKDAYS.map((day) => <div key={day} className="pt-cal__head" role="columnheader">{day}</div>)}
              {Array.from({ length: leading }, (_, index) => <div key={`blank-${index}`} className="pt-cal__blank" aria-hidden="true" />)}
              {data.days.map((day) => (
                <div
                  key={day.date}
                  className="pt-cal__day"
                  data-status={day.status}
                  role="gridcell"
                  aria-label={`${day.date}: ${ATTENDANCE_LABEL[day.status] || 'Not yet'}`}
                >
                  {Number(day.date.slice(-2))}
                  {day.status !== 'present' && ATTENDANCE_LABEL[day.status] ? <small>{ATTENDANCE_LABEL[day.status]}</small> : null}
                </div>
              ))}
            </div>
          </div>
        ) : isLoading ? <p className="cb-muted">Loading attendance</p> : null}
      </Card>
    </Page>
  )
}

export default PortalAttendance
