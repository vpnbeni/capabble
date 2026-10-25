import { classLabel, formatTime } from '@/lib/format'
import type { MyPeriod } from '@/services/staffService'
import type { TimelineItem } from '@/ui'

/** Bell labels are often typed in capitals ("LUNCH"); the design system has no all-caps text. */
export const sentenceCase = (value: string) => (value === value.toUpperCase() ? value.charAt(0) + value.slice(1).toLowerCase() : value)

/** "I" or "3" → "Period I"; "1st" → "1st period"; anything longer is the school's own name for it. */
export const periodName = (label: string) =>
  /^[0-9IVXivx]{1,4}$/.test(label) ? `Period ${label}` : /^\d+(st|nd|rd|th)$/i.test(label) ? `${label} period` : sentenceCase(label)

/** "Class 7-A · English" */
export const classTitle = (period: MyPeriod) => [classLabel(period.className, period.section), period.subject].filter(Boolean).join(' · ')

/**
 * A teacher's day as Timeline rows. `now` ('HH:MM') marks done / current on today; pass null
 * for another day. Breaks are left out unless `withBreaks`.
 */
export const periodTimeline = (
  periods: MyPeriod[],
  { now, withBreaks = false, badgeFor }: { now: string | null; withBreaks?: boolean; badgeFor?: (period: MyPeriod) => TimelineItem['badge'] },
): TimelineItem[] =>
  periods
    .filter((period) => withBreaks || period.kind !== 'break')
    .map((period) => ({
      time: formatTime(period.start),
      title: period.kind === 'class' ? classTitle(period) : period.kind === 'break' ? sentenceCase(period.label) || 'Break' : 'Free period',
      detail: period.kind === 'break' || !period.label ? undefined : periodName(period.label),
      state: !now ? 'upcoming' : now >= period.end ? 'done' : now >= period.start ? 'current' : 'upcoming',
      badge: badgeFor?.(period),
    }))
