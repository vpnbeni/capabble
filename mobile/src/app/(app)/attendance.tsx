import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { formatMonth, monthAdd, monthOf, schoolToday } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalAttendance } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import type { AttendanceDayStatus } from '@/services/portalService'
import { space, type Tone } from '@/theme/tokens'
import { Card, DayGrid, Figure, IconButton, Progress, Screen, Text, type GridDay } from '@/ui'

// Only days that differ from an ordinary present day get a colour and a word.
const DAY_MARK: Partial<Record<AttendanceDayStatus, { tone?: Tone; label: string; muted?: boolean }>> = {
  absent: { tone: 'danger', label: 'Absent' },
  half_day: { tone: 'warning', label: 'Half day' },
  holiday: { tone: 'neutral', label: 'Holiday' },
  weekly_off: { label: '', muted: true },
  upcoming: { label: '', muted: true },
}

/** A month of the child's attendance: absences, half days and holidays. Unmarked school days count as present. */
export default function AttendanceScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const today = schoolToday()
  const [month, setMonth] = useState(monthOf(today))
  const attendance = usePortalAttendance(child?.studentId, month)
  const data = attendance.data
  const summary = data?.summary

  const days = useMemo<GridDay[]>(
    () =>
      (data?.days ?? []).map((day) => {
        const mark = DAY_MARK[day.status]
        return { date: day.date, tone: mark?.tone, label: mark?.tone ? (day.status === 'holiday' && day.label ? day.label : mark.label) : undefined, muted: mark?.muted }
      }),
    [data],
  )

  return (
    <Screen title="Attendance" onBack={router.back} headerAction={<ChildSwitcher />} refreshing={attendance.isRefetching} onRefresh={attendance.refetch}>
      {!child ? (
        <NoChild />
      ) : (
        <>
          <Card flush>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space['space-2'], paddingVertical: space['space-1'] }}>
              <IconButton icon={ChevronLeft} label="Earlier month" onPress={() => setMonth((m) => monthAdd(m, -1))} />
              <Text variant="card-title" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center' }}>
                {formatMonth(month)}
              </Text>
              <IconButton icon={ChevronRight} label="Later month" disabled={month >= monthOf(today)} onPress={() => setMonth((m) => monthAdd(m, 1))} />
            </View>
            {summary ? (
              <View style={{ paddingHorizontal: space['space-4'], paddingBottom: space['space-4'], gap: space['space-3'] }}>
                <Figure
                  label={child.name.split(' ')[0]}
                  value={summary.percentage != null ? `${summary.percentage}%` : '—'}
                  caption={
                    summary.schoolDays
                      ? `Present ${summary.present} of ${summary.schoolDays} school days · ${summary.absent} absent · ${summary.halfDays} half ${summary.halfDays === 1 ? 'day' : 'days'}`
                      : 'No school days this month yet'
                  }
                />
                {summary.schoolDays ? (
                  <Progress value={summary.present} max={summary.schoolDays} label="Days present" />
                ) : null}
              </View>
            ) : null}
          </Card>

          {attendance.isPending ? (
            <CardSkeleton rows={4} />
          ) : attendance.isError && !data ? (
            <LoadFailed what="Attendance" error={attendance.error} onRetry={attendance.refetch} />
          ) : (
            <Card>
              <DayGrid days={days} today={today} label={`Attendance for ${formatMonth(month)}`} />
            </Card>
          )}
        </>
      )}
    </Screen>
  )
}
