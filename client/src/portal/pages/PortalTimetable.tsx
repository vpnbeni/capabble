import React from 'react'
import { classLabel } from '@/utils/classLabel'
import { CalendarDays } from 'lucide-react'
import { Card, EmptyState, Page, PageHeader, formatTime } from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalTimetable } from '../usePortal'
import { LoadFailed, NoChild } from './shared'

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase()

/** The class's published weekly timetable. */
const PortalTimetable: React.FC = () => {
  const { child } = usePortal()
  const { data, isLoading, isError } = usePortalTimetable(child?.studentId)

  if (!child) return <Page><NoChild /></Page>
  const today = DAY_NAMES[new Date().getDay()]

  return (
    <Page>
      <PageHeader
        title="Timetable"
        subtitle={data ? `${classLabel(data.className, data.section)}${data.classTeacher ? ` · Class teacher ${data.classTeacher}` : ''}` : child.name}
      />
      {isError ? <LoadFailed what="The timetable" /> : null}
      {!isLoading && !isError && !data ? (
        <Card>
          <EmptyState icon={CalendarDays} title="The timetable isn't published yet" body="It will show here once the school publishes it." />
        </Card>
      ) : null}
      {data ? (
        <Card flush>
          <div className="pt-tt">
            <table>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  {data.periods.map((period) => (
                    <th key={period.id} scope="col">
                      {period.label}
                      <div className="cb-subtle">{formatTime(period.startTime)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr key={day.name} className={day.name === today ? 'is-today' : undefined}>
                    <th scope="row">{titleCase(day.name)}</th>
                    {day.slots.map((slot, index) => (slot.isBreak ? (
                      <td key={data.periods[index]?.id || index} className="is-break">Break</td>
                    ) : (
                      <td key={data.periods[index]?.id || index}>
                        <div className="pt-tt__subject">{slot.subject || '—'}</div>
                        {slot.teacher ? <div className="pt-tt__teacher">{slot.teacher}</div> : null}
                      </td>
                    )))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </Page>
  )
}

export default PortalTimetable
