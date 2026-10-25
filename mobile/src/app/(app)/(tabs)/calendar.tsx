import { useLocalSearchParams, useRouter } from 'expo-router'
import { CalendarCheck } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { dayKeyAdd, formatDayKey, formatMonth, monthOf, schoolToday } from '@/lib/format'
import { CalendarItemSheet } from '@/portal/CalendarItemSheet'
import { LAYER_CATEGORY, agendaDays, isForChild, itemsByDay } from '@/portal/calendarUi'
import { usePortalCalendar } from '@/portal/queries'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { CalendarItem } from '@/services/calendarTypes'
import { useTheme } from '@/theme/ThemeProvider'
import { Agenda, ChipRail, MobileScreen, NavBar, StatusView, Surface, WeekStrip, type WeekDay } from '@/ui'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (key: string) => new Date(`${key}T00:00:00.000Z`).getUTCDay()
/** The Monday of the week a day falls in. */
const weekStart = (key: string) => dayKeyAdd(key, -((weekdayOf(key) + 6) % 7))

/** The family's calendar by day: holidays, school events with their own instructions, exams, fee dates, meetings. */
export default function CalendarScreen() {
  const { colors } = useTheme()
  const today = schoolToday()
  // A notification links here with ?event= (and sometimes ?date=), as on the website.
  const linked = useLocalSearchParams<{ event?: string; date?: string }>()
  const router = useRouter()
  const [selected, setSelected] = useState(linked.date || today)
  const [child, setChild] = useState('all')
  const [open, setOpen] = useState<CalendarItem | null>(null)

  // Six weeks from the Monday of the chosen week: the strip, then the agenda after the chosen day.
  const from = weekStart(selected)
  const to = dayKeyAdd(from, 41)
  const calendar = usePortalCalendar(from, to)
  const data = calendar.data
  const schoolDay = data?.today ?? today

  const items = useMemo(() => (data?.items ?? []).filter((item) => child === 'all' || isForChild(item, child)), [data, child])
  const byDay = useMemo(() => itemsByDay(items, from, to), [items, from, to])
  const agenda = useMemo(() => {
    const later = new Map([...byDay.entries()].filter(([date]) => date >= selected))
    return agendaDays(later, schoolDay, data, colors, setOpen)
  }, [byDay, selected, schoolDay, data, colors])

  const week: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = dayKeyAdd(from, index)
    const day = data?.days?.[date]
    return {
      date,
      weekday: WEEKDAYS[weekdayOf(date)],
      day: Number(date.slice(8)),
      today: date === schoolDay,
      off: day ? !day.working : false,
      dots: (byDay.get(date) ?? []).slice(0, 3).map((item) => colors[`chart-${LAYER_CATEGORY[item.layer] ?? 1}`]),
    }
  })

  const children = data?.children ?? []
  // The linked event stays open until closed (closing drops the link).
  const linkedItem = useMemo(() => {
    if (!linked.event || !data) return null
    return (
      data.items.find((item) => item.eventId === linked.event && (!linked.date || item.occurrence === linked.date)) ??
      data.items.find((item) => item.eventId === linked.event) ??
      null
    )
  }, [linked.event, linked.date, data])

  const close = () => {
    setOpen(null)
    if (linked.event) router.setParams({ event: undefined, date: undefined })
  }

  // The open item, refreshed when a reply changes the data under it.
  const shown = open ?? linkedItem
  const openItem = shown ? (data?.items.find((item) => item.id === shown.id) ?? shown) : null
  const [monthName, year] = formatMonth(monthOf(selected)).split(' ')

  return (
    <MobileScreen
      tabs
      refreshing={calendar.isRefetching}
      onRefresh={calendar.refetch}
      nav={
        <NavBar
          large
          eyebrow={`Calendar · ${year}`}
          title={monthName}
          actions={selected !== schoolDay ? [{ icon: CalendarCheck, label: 'Go to today', onPress: () => setSelected(schoolDay) }] : []}
        />
      }
      overlay={<CalendarItemSheet item={openItem} onClose={close} />}
    >
      <WeekStrip days={week} value={selected} onChange={setSelected} onWeekChange={(step) => setSelected(dayKeyAdd(selected, step * 7))} label="Choose a day" />
      {children.length > 1 ? (
        <ChipRail
          label="Whose dates"
          value={child}
          onChange={setChild}
          items={[
            { id: 'all', label: 'Everyone' },
            ...children.map((entry) => ({ id: entry.studentId, label: entry.name.split(' ')[0], avatar: { name: entry.name } })),
          ]}
        />
      ) : null}
      {calendar.isPending ? (
        <CardSkeleton rows={3} />
      ) : calendar.isError && !data ? (
        <LoadFailed what="The calendar" error={calendar.error} onRetry={calendar.refetch} />
      ) : (
        <Agenda
          groups={agenda}
          empty={
            <Surface padded={false}>
              <StatusView
                compact
                kind="empty"
                title={`Nothing on from ${selected === schoolDay ? 'today' : formatDayKey(selected, { weekday: 'short' })}`}
                body="Swipe the week or pick another day."
              />
            </Surface>
          }
        />
      )}
    </MobileScreen>
  )
}
