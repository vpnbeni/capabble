import { useRouter } from 'expo-router'
import { CalendarClock, CalendarOff } from 'lucide-react-native'
import { useState } from 'react'

import { dayKeyAdd, formatDayKey, schoolTimeNow, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useTheme } from '@/theme/ThemeProvider'
import { MobileScreen, NavBar, StatusView, Surface, Text, Timeline, WeekStrip, type WeekDay } from '@/ui'

import { periodTimeline } from './periods'
import { useMyTimetable } from './queries'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (key: string) => new Date(`${key}T00:00:00.000Z`).getUTCDay()
/** The Monday of the week a day falls in. */
const weekStart = (key: string) => dayKeyAdd(key, -((weekdayOf(key) + 6) % 7))

/**
 * A teacher's own timetable, a week at a time: pick a day on the strip (swipe for the next
 * week), see its periods with the one on now. Days off come from the school calendar.
 * Design system: ScreensSchoolDay · Timetable.
 */
export function MyTimetable() {
  const router = useRouter()
  const { colors } = useTheme()
  const today = schoolToday()
  const [selected, setSelected] = useState(today)
  const monday = weekStart(selected)
  const timetable = useMyTimetable(monday, dayKeyAdd(monday, 6))
  const days = timetable.data?.days ?? []
  const day = days.find((entry) => entry.date === selected)
  const classes = day?.periods.filter((period) => period.kind === 'class').length ?? 0

  const week: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = dayKeyAdd(monday, index)
    const info = days.find((entry) => entry.date === date)
    return {
      date,
      weekday: WEEKDAYS[weekdayOf(date)],
      day: Number(date.slice(8)),
      today: date === today,
      off: info ? !info.working : false,
      dots: info?.periods.some((period) => period.kind === 'class') ? [colors.accent] : undefined,
    }
  })

  const heading = selected === today ? 'Today' : formatDayKey(selected, { weekday: 'long', month: 'long' })

  return (
    <MobileScreen
      refreshing={timetable.isRefetching}
      onRefresh={timetable.refetch}
      nav={<NavBar title="Your timetable" back={{ label: 'Back', onPress: router.back }} />}
    >
      <WeekStrip days={week} value={selected} onChange={setSelected} onWeekChange={(delta) => setSelected(dayKeyAdd(monday, delta * 7))} label="Day" />
      {timetable.isPending ? (
        <CardSkeleton rows={5} />
      ) : timetable.isError ? (
        <LoadFailed what="Your timetable" error={timetable.error} onRetry={timetable.refetch} />
      ) : !timetable.data?.teacher ? (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={CalendarClock}
            title="Your login isn't linked to the timetable"
            body="Ask the school office to link your login to your staff record. Your periods show here once it is."
          />
        </Surface>
      ) : !timetable.data.publishedAt ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarClock} title="The timetable isn't published yet" body="Your periods show here once the school publishes it." />
        </Surface>
      ) : day && !day.working ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarOff} title={day.label || 'No school'} body={`${heading}: no classes.`} />
        </Surface>
      ) : !classes ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarClock} title="No classes for you" body={`${heading} has nothing timetabled for you.`} />
        </Surface>
      ) : (
        <Surface>
          <Text variant="m-headline" accessibilityRole="header">
            {heading}
          </Text>
          <Text variant="m-subhead" tone="muted" style={{ marginTop: -8 }}>
            {`${classes} ${classes === 1 ? 'class' : 'classes'}${day?.halfDayEndTime ? ' · half day' : ''}`}
          </Text>
          <Timeline compact items={periodTimeline(day?.periods ?? [], { now: selected === today ? schoolTimeNow() : null, withBreaks: true })} />
        </Surface>
      )}
    </MobileScreen>
  )
}
