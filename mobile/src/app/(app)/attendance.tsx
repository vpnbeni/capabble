import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { formatDayKey, formatMonth, monthAdd, monthOf, schoolToday } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalAttendance } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import type { AttendanceDayStatus } from '@/services/portalService'
import { space, type Tone } from '@/theme/tokens'
import { DayGrid, ListGroup, MobileButton, MobileScreen, NavBar, ProgressRing, Surface, Text, type DayMark } from '@/ui'

// Only days that differ from an ordinary present day get a colour and a letter.
const DAY_MARK: Partial<Record<AttendanceDayStatus, DayMark>> = {
  absent: { tone: 'danger', label: 'Absent', short: 'A' },
  half_day: { tone: 'warning', label: 'Half day', short: 'HD' },
  holiday: { tone: 'neutral', label: 'Holiday', short: 'H' },
}
const LEGEND: { tone: Tone; label: string }[] = [
  { tone: 'danger', label: 'Absent' },
  { tone: 'warning', label: 'Half day' },
  { tone: 'neutral', label: 'Holiday' },
]
/** Below 75% the ring turns red (the design system's attendance threshold). */
const REQUIRED_PERCENT = 75

/** A month of the child's attendance: absences, half days and holidays. Unmarked school days count as present. */
export default function AttendanceScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const today = schoolToday()
  const [month, setMonth] = useState(monthOf(today))
  const attendance = usePortalAttendance(child?.studentId, month)
  const data = attendance.data
  const summary = data?.summary

  const marks = useMemo(() => {
    const found: Record<string, DayMark> = {}
    for (const day of data?.days ?? []) {
      const mark = DAY_MARK[day.status]
      if (mark) found[day.date] = { ...mark, label: day.status === 'holiday' && day.label ? day.label : mark.label }
    }
    return found
  }, [data])
  const away = (data?.days ?? []).filter((day) => day.status === 'absent' || day.status === 'half_day')
  const [year, monthNumber] = month.split('-').map(Number)
  const legend = LEGEND.filter((entry) => Object.values(marks).some((mark) => mark.tone === entry.tone))
  const percent = summary?.percentage

  return (
    <MobileScreen
      refreshing={attendance.isRefetching}
      onRefresh={attendance.refetch}
      nav={<NavBar title="Attendance" back={{ label: 'Back', onPress: router.back }} trailing={<ChildSwitcher />} />}
    >
      {!child ? (
        <NoChild />
      ) : (
        <>
          {summary ? (
            <Surface>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-4'] }}>
                <ProgressRing
                  value={percent ?? 0}
                  label={percent != null ? `${percent}%` : '—'}
                  sublabel="present"
                  size={96}
                  tone={percent != null && percent < REQUIRED_PERCENT ? 'danger' : undefined}
                  ariaLabel={percent != null ? `${percent}% present in ${formatMonth(month)}` : 'No school days yet'}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" tone="muted">
                    {formatMonth(month)}
                  </Text>
                  <Text variant="m-nav-title">
                    {summary.schoolDays ? `${summary.present} of ${summary.schoolDays} days` : 'No school days yet'}
                  </Text>
                  {summary.schoolDays ? (
                    <Text variant="m-subhead" tone={percent != null && percent < REQUIRED_PERCENT ? 'danger' : 'muted'}>
                      {percent != null && percent < REQUIRED_PERCENT
                        ? `Below ${REQUIRED_PERCENT}% attendance`
                        : `${summary.absent} absent · ${summary.halfDays} half ${summary.halfDays === 1 ? 'day' : 'days'}`}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Surface>
          ) : null}

          {attendance.isPending ? (
            <CardSkeleton rows={4} />
          ) : attendance.isError && !data ? (
            <LoadFailed what="Attendance" error={attendance.error} onRetry={attendance.refetch} />
          ) : (
            <Surface>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <MobileButton variant="plain" size="medium" icon={ChevronLeft} aria-label="Earlier month" onPress={() => setMonth((m) => monthAdd(m, -1))} />
                <Text variant="m-headline" accessibilityRole="header" accessibilityLiveRegion="polite">
                  {formatMonth(month)}
                </Text>
                <MobileButton
                  variant="plain"
                  size="medium"
                  icon={ChevronRight}
                  aria-label="Later month"
                  disabled={month >= monthOf(today)}
                  onPress={() => setMonth((m) => monthAdd(m, 1))}
                />
              </View>
              <DayGrid year={year} month={monthNumber} marks={marks} today={today} legend={legend} />
            </Surface>
          )}

          {away.length ? (
            <ListGroup
              header="Days away this month"
              items={away.map((day) => ({
                title: day.status === 'absent' ? 'Absent' : 'Half day',
                subtitle: formatDayKey(day.date, { weekday: 'short' }),
                badge: { label: day.status === 'absent' ? 'Absent' : 'Half day', tone: day.status === 'absent' ? 'danger' : 'warning' },
              }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
