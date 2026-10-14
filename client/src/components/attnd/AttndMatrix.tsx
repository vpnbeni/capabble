import React, { useEffect, useRef } from 'react'
import { Badge, EmptyState, cx } from '@/components/ui'
import type { LucideIcon } from 'lucide-react'
import { formatCount } from '@/components/students/studentFormat'
import './attnd.css'

export type MatrixDay = { dayLabel: string; dateKey: string; weekday: string }
export type MatrixPerson = { _id: string; code?: string | null; name?: string | null }
export type MatrixEmpty = { icon?: LucideIcon; title: React.ReactNode; body?: React.ReactNode }

export const pluralize = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`

/** Working / present / absent counts above a matrix, with the key for its marks. */
export const AttndSummary: React.FC<{
  working: number
  workingLabel: string
  present: number
  absent: number
  holidayHint: string
}> = ({ working, workingLabel, present, absent, holidayHint }) => (
  <div className="attnd-summary">
    <div className="attnd-summary__counts" aria-live="polite">
      <Badge tone="neutral" dot={false} size="lg">
        {pluralize(working, workingLabel)}
      </Badge>
      <Badge tone="success" size="lg">
        {formatCount(present)} present
      </Badge>
      <Badge tone="danger" size="lg">
        {formatCount(absent)} absent
      </Badge>
    </div>
    <div className="attnd-legend">
      <span className="attnd-legend__item">
        <input type="checkbox" className="attnd-mark" checked readOnly tabIndex={-1} aria-hidden="true" />
        Absent
      </span>
      <span className="attnd-legend__item">
        <span className="attnd-legend__swatch is-holiday" aria-hidden="true" />
        Holiday
      </span>
      <span className="attnd-legend__item">{holidayHint}</span>
    </div>
  </div>
)

const MatrixMessage: React.FC<{ colSpan: number; loading?: boolean; loadingLabel?: string; empty?: MatrixEmpty }> = ({
  colSpan,
  loading,
  loadingLabel,
  empty,
}) => (
  <tr>
    <td colSpan={colSpan} className="attnd-matrix-state">
      {loading ? (
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          {loadingLabel}
        </div>
      ) : empty ? (
        <EmptyState compact icon={empty.icon} title={empty.title} body={empty.body} />
      ) : null}
    </td>
  </tr>
)

/**
 * A month of attendance: one row per person, one column per day. A ticked box marks
 * the person absent; clicking a date header turns that day into a holiday or back.
 */
export const AttndMonthMatrix: React.FC<{
  people: MatrixPerson[]
  days: MatrixDay[]
  todayKey: string
  codeLabel: string
  nameLabel: string
  isHoliday: (dateKey: string) => boolean
  isAbsent: (personId: string, dateKey: string) => boolean
  onToggleAbsent: (personId: string, dateKey: string) => void
  onToggleDay: (dateKey: string) => void
  loading?: boolean
  loadingLabel: string
  empty?: MatrixEmpty | null
}> = ({
  people,
  days,
  todayKey,
  codeLabel,
  nameLabel,
  isHoliday,
  isAbsent,
  onToggleAbsent,
  onToggleDay,
  loading,
  loadingLabel,
  empty,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const todayRef = useRef<HTMLTableCellElement>(null)
  const colSpan = 3 + days.length

  // Bring today's column into view next to the pinned name columns.
  useEffect(() => {
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return
      const column = todayRef.current
      const scroller = scrollRef.current
      if (!column || !scroller) return
      const pinned = scroller.querySelector<HTMLElement>('th.is-name')
      const pinnedRight = pinned ? pinned.getBoundingClientRect().right : scroller.getBoundingClientRect().left
      const offset = column.getBoundingClientRect().left - pinnedRight - 3 * column.offsetWidth
      scroller.scrollTo({ left: Math.max(0, scroller.scrollLeft + offset), behavior: 'smooth' })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [days, loading, people.length])

  return (
    <div ref={scrollRef} className="attnd-matrix-scroll">
      <table className="attnd-matrix">
        <thead>
          <tr>
            <th scope="col" className="is-pin is-idx">
              #
            </th>
            <th scope="col" className="is-pin is-id">
              {codeLabel}
            </th>
            <th scope="col" className="is-pin is-name">
              {nameLabel}
            </th>
            {days.map((day) => {
              const holiday = isHoliday(day.dateKey)
              const today = day.dateKey === todayKey
              return (
                <th
                  key={day.dateKey}
                  ref={today ? todayRef : undefined}
                  scope="col"
                  className={cx('attnd-dayhead', holiday && 'is-holiday', today && 'is-today')}
                  aria-current={today ? 'date' : undefined}
                >
                  <button
                    type="button"
                    className="attnd-day"
                    onClick={() => onToggleDay(day.dateKey)}
                    title={holiday ? 'Holiday. Click to make it a working day.' : 'Working day. Click to make it a holiday.'}
                    aria-label={`${day.weekday} ${day.dayLabel}, ${holiday ? 'holiday' : 'working day'}. Toggle.`}
                  >
                    <span className="attnd-day__num">{day.dayLabel}</span>
                    <span className="attnd-day__dow">{day.weekday}</span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading || empty ? (
            <MatrixMessage colSpan={colSpan} loading={loading} loadingLabel={loadingLabel} empty={empty || undefined} />
          ) : (
            people.map((person, index) => (
              <tr key={person._id}>
                <td className="is-pin is-idx">{index + 1}</td>
                <td className="is-pin is-id" title={person.code || undefined}>
                  {person.code || '—'}
                </td>
                <td className="is-pin is-name" title={person.name || undefined}>
                  {person.name || '—'}
                </td>
                {days.map((day) => {
                  const holiday = isHoliday(day.dateKey)
                  const today = day.dateKey === todayKey
                  return (
                    <td
                      key={day.dateKey}
                      className={cx('attnd-cell', holiday && 'is-holiday', today && 'is-today')}
                    >
                      <input
                        type="checkbox"
                        className="attnd-mark"
                        checked={!holiday && isAbsent(person._id, day.dateKey)}
                        disabled={holiday}
                        onChange={() => onToggleAbsent(person._id, day.dateKey)}
                        title={holiday ? `${day.dayLabel} ${day.weekday} is a holiday` : `Absent on ${day.dayLabel} ${day.weekday}`}
                        aria-label={`${person.name || 'Unnamed'} absent on ${day.weekday} ${day.dayLabel}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export type DayColumn = {
  key: string
  name: React.ReactNode
  meta?: React.ReactNode
  holiday: boolean
  /** When set, the header toggles holiday for this column. */
  onToggleHoliday?: () => void
  toggleLabel?: string
}

/**
 * One day of attendance: a column per class-section or staff type, each listing its
 * people with an absent box beside the name.
 */
export const AttndDayMatrix: React.FC<{
  columns: DayColumn[]
  peopleByColumn: Record<string, MatrixPerson[]>
  isAbsent: (personId: string) => boolean
  onToggleAbsent: (personId: string, columnKey: string) => void
  loading?: boolean
  loadingLabel: string
  empty?: MatrixEmpty | null
}> = ({ columns, peopleByColumn, isAbsent, onToggleAbsent, loading, loadingLabel, empty }) => {
  const rowCount = Math.max(0, ...columns.map((column) => peopleByColumn[column.key]?.length || 0))
  const colSpan = 1 + Math.max(columns.length, 1)

  return (
    <div className="attnd-matrix-scroll">
      <table className="attnd-matrix attnd-matrix--narrow">
        <thead>
          <tr>
            <th scope="col" className="is-pin is-idx">
              #
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cx('attnd-grouphead', column.holiday && 'is-holiday')}>
                {column.onToggleHoliday ? (
                  <button
                    type="button"
                    className="attnd-group"
                    onClick={column.onToggleHoliday}
                    title={column.holiday ? 'Holiday. Click to make it a working day.' : 'Working day. Click to make it a holiday.'}
                    aria-label={column.toggleLabel}
                  >
                    <span className="attnd-group__name">{column.name}</span>
                    <span className="attnd-group__meta">{column.meta}</span>
                  </button>
                ) : (
                  <div className="attnd-group attnd-group--static">
                    <span className="attnd-group__name">{column.name}</span>
                    <span className="attnd-group__meta">{column.meta}</span>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading || empty || rowCount === 0 ? (
            <MatrixMessage colSpan={colSpan} loading={loading} loadingLabel={loadingLabel} empty={empty || undefined} />
          ) : (
            Array.from({ length: rowCount }, (_, index) => (
              <tr key={index}>
                <td className="is-pin is-idx">{index + 1}</td>
                {columns.map((column) => {
                  const person = peopleByColumn[column.key]?.[index]
                  if (!person) return <td key={column.key} className={cx('attnd-slotcell', column.holiday && 'is-holiday')} />
                  const absent = !column.holiday && isAbsent(person._id)
                  return (
                    <td key={column.key} className={cx('attnd-slotcell', column.holiday && 'is-holiday')}>
                      <label
                        className={cx('attnd-slot', absent && 'is-absent', column.holiday && 'is-disabled')}
                        title={person.name || undefined}
                      >
                        <input
                          type="checkbox"
                          className="attnd-mark"
                          checked={absent}
                          disabled={column.holiday}
                          onChange={() => onToggleAbsent(person._id, column.key)}
                          aria-label={`${person.name || 'Unnamed'} absent`}
                        />
                        <span className="attnd-slot__name">{person.name || '—'}</span>
                      </label>
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
