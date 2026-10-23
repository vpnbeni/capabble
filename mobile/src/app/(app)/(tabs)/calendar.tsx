import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { formatMonth, monthAdd, monthEnd, monthOf, schoolToday } from '@/lib/format'
import { CalendarItemSheet } from '@/portal/CalendarItemSheet'
import { groupByDay, isForChild } from '@/portal/calendarUi'
import { usePortalCalendar } from '@/portal/queries'
import type { CalendarItem } from '@/services/calendarTypes'
import { space } from '@/theme/tokens'
import { AgendaList, Button, Card, Chips, EmptyState, IconButton, Screen, Skeleton, Text } from '@/ui'

/** The family's calendar by day: holidays, school events with their own instructions, exams, fee dates, meetings. */
export default function CalendarScreen() {
  const today = schoolToday()
  // A notification links here with ?event= (and sometimes ?date=), as on the website.
  const linked = useLocalSearchParams<{ event?: string; date?: string }>()
  const router = useRouter()
  const [month, setMonth] = useState(monthOf(linked.date || today))
  const [child, setChild] = useState('all')
  const [open, setOpen] = useState<CalendarItem | null>(null)
  const from = `${month}-01`
  const to = monthEnd(month)
  const calendar = usePortalCalendar(from, to)
  const data = calendar.data
  const schoolDay = data?.today ?? today
  const isThisMonth = month === monthOf(schoolDay)

  const items = useMemo(() => (data?.items ?? []).filter((item) => child === 'all' || isForChild(item, child)), [data, child])
  // This month starts from today; other months from their first day.
  const groups = useMemo(() => groupByDay(items, isThisMonth ? schoolDay : from, to, data), [items, isThisMonth, schoolDay, from, to, data])
  const children = data?.children ?? []
  // The linked event stays open until closed (closing drops the link).
  const linkedItem = useMemo(() => {
    if (!linked.event || !data) return null
    return data.items.find((item) => item.eventId === linked.event && (!linked.date || item.occurrence === linked.date))
      ?? data.items.find((item) => item.eventId === linked.event)
      ?? null
  }, [linked.event, linked.date, data])

  const close = () => {
    setOpen(null)
    if (linked.event) router.setParams({ event: undefined, date: undefined })
  }

  // The open item, refreshed when a reply changes the data under it.
  const shown = open ?? linkedItem
  const openItem = shown ? (data?.items.find((item) => item.id === shown.id) ?? shown) : null

  return (
    <Screen title="Calendar" refreshing={calendar.isRefetching} onRefresh={calendar.refetch}>
      {children.length > 1 ? (
        <Chips
          label="Whose dates"
          value={child}
          onChange={setChild}
          options={[{ value: 'all', label: 'Everyone' }, ...children.map((c) => ({ value: c.studentId, label: c.name.split(' ')[0] }))]}
        />
      ) : null}

      <Card flush>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space['space-2'], paddingVertical: space['space-1'] }}>
          <IconButton icon={ChevronLeft} label="Earlier month" onPress={() => setMonth((m) => monthAdd(m, -1))} />
          <Text variant="card-title" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center' }}>
            {formatMonth(month)}
          </Text>
          <IconButton icon={ChevronRight} label="Later month" onPress={() => setMonth((m) => monthAdd(m, 1))} />
        </View>

        {calendar.isPending ? (
          <View style={{ padding: space['space-4'], gap: space['space-5'] }}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={{ gap: space['space-2'] }}>
                <Skeleton width="30%" height={14} />
                <Skeleton width="85%" />
              </View>
            ))}
          </View>
        ) : calendar.isError && !data ? (
          <EmptyState
            title="The calendar didn't load"
            body={calendar.error.message}
            action={<Button label="Try again" variant="secondary" onPress={() => calendar.refetch()} />}
          />
        ) : (
          <AgendaList
            groups={groups}
            today={schoolDay}
            onEntryPress={(entry) => setOpen(items.find((item) => item.id === entry.id) ?? null)}
            empty={
              <EmptyState
                title={isThisMonth ? 'Nothing else this month' : `Nothing in ${formatMonth(month)}`}
                body="Use the arrows to see other months."
              />
            }
          />
        )}
      </Card>

      <CalendarItemSheet item={openItem} onClose={close} />
    </Screen>
  )
}
