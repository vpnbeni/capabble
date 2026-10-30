import { classLabel, formatDayKey, formatTime } from '@/lib/format'
import type { DayKind, HolidayCategory, SchoolDayRule } from '@/services/schoolDaysService'

// Same words as the website's Settings → School days.
export const KIND_LABELS: Record<DayKind, string> = {
  holiday: 'Holiday',
  vacation: 'Vacation',
  closure: 'Closure or mode change',
  half_day: 'Half day',
  weekly_off: 'Weekly day off',
  working_day: 'Extra working day',
}

export const KIND_HINTS: Record<Exclude<DayKind, 'weekly_off'>, string> = {
  holiday: 'A day the school is closed, such as Diwali',
  vacation: 'Several days off, such as summer vacation',
  closure: 'A sudden closure or online classes, such as a rain or pollution order',
  half_day: 'School ends early',
  working_day: 'Opens a day that would be off, such as a compensatory Saturday',
}

export const CATEGORY_LABELS: Record<HolidayCategory, string> = {
  national: 'National',
  state: 'State',
  school: 'School',
  religious: 'Religious or local',
  other: 'Other',
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

export const weeklyText = (rule: Pick<SchoolDayRule, 'weekly'>) => {
  const day = WEEKDAYS[rule.weekly?.weekday ?? 0]
  const weeks = rule.weekly?.weeksOfMonth ?? []
  return weeks.length ? `${weeks.map((week) => ORDINALS[week - 1]).join(' and ')} ${day} of the month` : `Every ${day}`
}

/** "Fri 6 Nov to Wed 11 Nov", "Sat 31 Oct, ends 12:30 pm". */
export const ruleDates = (rule: Pick<SchoolDayRule, 'startDate' | 'endDate' | 'kind' | 'halfDayEndTime' | 'mode'>) => {
  const start = formatDayKey(rule.startDate, { weekday: 'short' })
  const range = rule.endDate && rule.endDate !== rule.startDate ? `${start} to ${formatDayKey(rule.endDate, { weekday: 'short' })}` : start
  if (rule.kind === 'half_day' && rule.halfDayEndTime) return `${range}, ends ${formatTime(rule.halfDayEndTime)}`
  if (rule.kind === 'closure' && rule.mode && rule.mode !== 'closed') return `${range}, classes ${rule.mode}`
  return range
}

/** "Whole school", "Class 3, Class 7-A". Sections are stored as "7|A". */
export const ruleFor = (rule: Pick<SchoolDayRule, 'appliesTo'>) =>
  rule.appliesTo?.scope === 'classes'
    ? [...(rule.appliesTo.classes ?? []).map((name) => classLabel(name)), ...(rule.appliesTo.sections ?? []).map((key) => classLabel(...(key.split('|') as [string, string])))].join(', ') ||
      'Some classes'
    : 'Whole school'
