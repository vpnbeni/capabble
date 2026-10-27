import { useLocalSearchParams, useRouter } from 'expo-router'
import { CalendarClock } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { CardSkeleton } from '@/portal/states'
import { useHostSlots, useRescheduleMeeting } from '@/staff/queries'
import { ActionBar, BottomSheet, Callout, ListGroup, MobileScreen, MonthPicker, NavBar, SlotPicker, haptic, useToast } from '@/ui'

/** Move a booked meeting to another free time with the same host; the visitor hears about it. */
export default function RescheduleMeetingScreen() {
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ id: string; hostId: string; date?: string; name?: string }>()
  const today = schoolToday()
  const [date, setDate] = useState(params.date && params.date >= today ? params.date : today)
  const [startTime, setStartTime] = useState('')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slots = useHostSlots(params.hostId, date)
  const move = useRescheduleMeeting()
  const free = (slots.data?.slots ?? []).filter((slot) => slot.state === 'free')

  const submit = async () => {
    if (!startTime) {
      haptic.error()
      setError('Choose a new time.')
      return
    }
    try {
      await move.mutateAsync({ id: params.id, date, startTime })
      haptic.success()
      toast(`Moved to ${formatDayKey(date, { weekday: 'short' })}, ${formatTime(startTime)}`)
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't moved. Try again.")
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title="Change time" back={{ label: 'Meetings', onPress: router.back }} />}
      actionBar={
        startTime ? (
          <ActionBar
            icon={CalendarClock}
            summary={params.name || 'Meeting'}
            detail={`${formatDayKey(date, { weekday: 'short' })}, ${formatTime(startTime)}`}
            label={move.isPending ? 'Moving…' : 'Move meeting'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <BottomSheet open={picking} onClose={() => setPicking(false)} title="Date">
          <MonthPicker
            value={date}
            today={today}
            min={today}
            onChange={(value) => {
              setDate(value)
              setStartTime('')
              setPicking(false)
            }}
          />
        </BottomSheet>
      }
    >
      {error ? (
        <Callout tone="danger" title="Not moved">
          {error}
        </Callout>
      ) : null}
      <ListGroup items={[{ title: 'Date', value: formatDayKey(date, { weekday: 'short' }), onPress: () => setPicking(true) }]} />
      {slots.isPending ? (
        <CardSkeleton rows={2} />
      ) : slots.data?.closed || !free.length ? (
        <Callout tone="neutral" title="No free time on this day">
          {slots.data?.reason || 'Every time is booked or taken by teaching. Choose another day.'}
        </Callout>
      ) : (
        <SlotPicker
          label="New time"
          value={startTime || null}
          onChange={setStartTime}
          slots={(slots.data?.slots ?? []).filter((slot) => slot.state !== 'past').map((slot) => ({ value: slot.start, label: formatTime(slot.start), taken: slot.state !== 'free' }))}
        />
      )}
    </MobileScreen>
  )
}
