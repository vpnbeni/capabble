import { useRouter } from 'expo-router'
import { useState } from 'react'

import { classLabel, dayKeyAdd, formatTime, schoolToday } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalTimetable } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { MobileScreen, NavBar, StatusView, Surface, Text, Timeline, WeekStrip, type TimelineItem } from '@/ui'

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const shortDay = (name: string) => name.charAt(0) + name.slice(1, 3).toLowerCase()
const longDay = (name: string) => name.charAt(0) + name.slice(1).toLowerCase()
/** Bell labels are often typed in capitals ("LUNCH"); the design system has no all-caps text. */
const sentenceCase = (value: string) => (value === value.toUpperCase() ? value.charAt(0) + value.slice(1).toLowerCase() : value)
/** "HH:MM" now, in the school's time zone. */
const schoolClock = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

/** The class's published timetable, one day at a time; today's periods show which one is on now. */
export default function TimetableScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const timetable = usePortalTimetable(child?.studentId)
  const data = timetable.data
  const today = schoolToday()
  const todayIndex = new Date(`${today}T00:00:00.000Z`).getUTCDay()
  const todayName = DAY_NAMES[todayIndex]
  const monday = dayKeyAdd(today, -((todayIndex + 6) % 7))
  const [picked, setPicked] = useState<string | null>(null)
  const dayName = picked ?? (data?.days.some((day) => day.name === todayName) ? todayName : data?.days[0]?.name) ?? ''
  const day = data?.days.find((entry) => entry.name === dayName)

  // This week's date for each school day, so the strip reads like the calendar.
  const dateOf = (name: string) => dayKeyAdd(monday, (DAY_NAMES.indexOf(name) + 6) % 7)
  const week = (data?.days ?? []).map((entry) => {
    const date = dateOf(entry.name)
    return { date, weekday: shortDay(entry.name), day: Number(date.slice(8)), today: entry.name === todayName }
  })

  const now = schoolClock()
  const isToday = dayName === todayName
  const periods: TimelineItem[] = (data?.periods ?? []).map((period, index) => {
    const slot = day?.slots[index]
    const isBreak = period.isBreak || slot?.isBreak
    const state = !isToday ? 'upcoming' : now >= period.endTime ? 'done' : now >= period.startTime ? 'current' : 'upcoming'
    return {
      time: formatTime(period.startTime),
      title: isBreak ? (period.label ? sentenceCase(period.label) : 'Break') : slot?.subject || 'Free period',
      detail: isBreak ? undefined : [slot?.teacher, sentenceCase(period.label)].filter(Boolean).join(' · ') || undefined,
      state,
    }
  })

  return (
    <MobileScreen
      refreshing={timetable.isRefetching}
      onRefresh={timetable.refetch}
      nav={<NavBar title="Timetable" back={{ label: 'Back', onPress: router.back }} trailing={<ChildSwitcher />} />}
    >
      {!child ? (
        <NoChild />
      ) : timetable.isPending ? (
        <CardSkeleton rows={5} />
      ) : timetable.isError ? (
        <LoadFailed what="The timetable" error={timetable.error} onRetry={timetable.refetch} />
      ) : !data ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" title="The timetable isn't published yet" body="It shows here once the school publishes it." />
        </Surface>
      ) : (
        <>
          <WeekStrip days={week} value={dateOf(dayName)} onChange={(date) => setPicked(data.days.find((entry) => dateOf(entry.name) === date)?.name ?? null)} label="Day" />
          <Surface>
            <Text variant="m-headline" accessibilityRole="header">
              {isToday ? 'Today' : longDay(dayName)}
            </Text>
            <Text variant="m-subhead" tone="muted" style={{ marginTop: -8 }}>
              {`${classLabel(data.className, data.section)}${data.classTeacher ? ` · Class teacher ${data.classTeacher}` : ''}`}
            </Text>
            <Timeline compact items={periods} />
          </Surface>
        </>
      )}
    </MobileScreen>
  )
}
