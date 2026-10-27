import { useRouter } from 'expo-router'
import { CalendarClock, CalendarOff } from 'lucide-react-native'
import { useState } from 'react'

import { dayKeyAdd, formatDayKey, schoolTimeNow, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useTheme } from '@/theme/ThemeProvider'
import { MobileScreen, NavBar, StatusView, Surface, Text, Timeline, WeekStrip, type WeekDay } from '@/ui'

import type { MyTimetable as Week } from '@/services/staffService'

import { periodTimeline } from './periods'
import { useMyTimetable } from './queries'
import type { TimetableTarget } from './timetableGrid'
import { useTargetWeek } from './timetableQueries'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (key: string) => new Date(`${key}T00:00:00.000Z`).getUTCDay()
/** The Monday of the week a day falls in. */
const weekStart = (key: string) => dayKeyAdd(key, -((weekdayOf(key) + 6) % 7))

type WeekQuery = { data?: Week; isPending: boolean; isError: boolean; error: Error | null; isRefetching: boolean; refetch: () => unknown }

/** The signed-in teacher's own week (GET /timetable/me). */
export function MyTimetable() {
  const today = schoolToday()
  const [selected, setSelected] = useState(today)
  const monday = weekStart(selected)
  return <WeekTimetable title="Your timetable" selected={selected} onSelect={setSelected} week={useMyTimetable(monday, dayKeyAdd(monday, 6))} />
}

/** Any class's or teacher's week, from the school's published timetable (timetable readers). */
export function TargetTimetable({ target, title }: { target: TimetableTarget; title: string }) {
  const today = schoolToday()
  const [selected, setSelected] = useState(today)
  return <WeekTimetable title={title} selected={selected} onSelect={setSelected} week={useTargetWeek(target, weekStart(selected))} forClass={target.type === 'class'} other />
}

/**
 * A timetable a week at a time: pick a day on the strip (swipe for the next week), see its
 * periods with the one on now. Days off come from the school calendar.
 * Design system: ScreensSchoolDay · Timetable.
 */
function WeekTimetable({
  title,
  selected,
  onSelect: setSelected,
  week: timetable,
  forClass = false,
  other = false,
}: {
  title: string
  selected: string
  onSelect: (date: string) => void
  week: WeekQuery
  forClass?: boolean
  /** Someone else's timetable (or a class's): the empty states say so. */
  other?: boolean
}) {
  const router = useRouter()
  const { colors } = useTheme()
  const today = schoolToday()
  const monday = weekStart(selected)
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
      nav={<NavBar title={title} back={{ label: 'Back', onPress: router.back }} />}
    >
      <WeekStrip days={week} value={selected} onChange={setSelected} onWeekChange={(delta) => setSelected(dayKeyAdd(monday, delta * 7))} label="Day" />
      {timetable.isPending ? (
        <CardSkeleton rows={5} />
      ) : timetable.isError ? (
        <LoadFailed what={title} error={timetable.error} onRetry={timetable.refetch} />
      ) : !timetable.data?.teacher ? (
        <Surface padded={false}>
          {other ? (
            <StatusView compact kind="empty" icon={CalendarClock} title="Not in the timetable" body="This class or teacher isn't in the school's timetable." />
          ) : (
            <StatusView
              compact
              kind="empty"
              icon={CalendarClock}
              title="Your login isn't linked to the timetable"
              body="Ask the school office to link your login to your staff record. Your periods show here once it is."
            />
          )}
        </Surface>
      ) : !timetable.data.publishedAt ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarClock} title="The timetable isn't published yet" body="Periods show here once the school publishes it." />
        </Surface>
      ) : day && !day.working ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarOff} title={day.label || 'No school'} body={`${heading}: no classes.`} />
        </Surface>
      ) : !classes ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarClock} title={other ? 'Nothing timetabled' : 'No classes for you'} body={`${heading} has nothing timetabled${other ? '' : ' for you'}.`} />
        </Surface>
      ) : (
        <Surface>
          <Text variant="m-headline" accessibilityRole="header">
            {heading}
          </Text>
          <Text variant="m-subhead" tone="muted" style={{ marginTop: -8 }}>
            {`${classes} ${forClass ? (classes === 1 ? 'period' : 'periods') : classes === 1 ? 'class' : 'classes'}${day?.halfDayEndTime ? ' · half day' : ''}`}
          </Text>
          <Timeline compact items={periodTimeline(day?.periods ?? [], { now: selected === today ? schoolTimeNow() : null, withBreaks: true, forClass })} />
        </Surface>
      )}
    </MobileScreen>
  )
}
