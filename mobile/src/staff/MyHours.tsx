import { usePreventRemove, useRouter } from 'expo-router'
import { CalendarOff, Clock, Plus } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { MyHost, WeeklyWindow } from '@/services/appntService'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  SlotPicker,
  StatusView,
  Surface,
  Switch,
  haptic,
  useToast,
} from '@/ui'

import { useAllHosts, useMyHost, useSaveMyHours, useUpdateHost } from './queries'

const DAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TIMES = Array.from({ length: 25 }, (_, index) => {
  const minutes = 7 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`
})

type Draft = Pick<MyHost, 'weeklyAvailability' | 'blockedDates'>

/**
 * A host's weekly hours for meetings and their days off. The front desk and families book inside
 * these. With `hostId` the principal edits someone else's (Meetings → Hosts).
 */
export function MyHours({ hostId }: { hostId?: string } = {}) {
  const router = useRouter()
  const toast = useToast()
  const own = useMyHost(!hostId)
  const hosts = useAllHosts(Boolean(hostId))
  const other = hosts.data?.find((row) => row._id === hostId)
  const host = hostId ? { data: other, isPending: hosts.isPending, isError: hosts.isError || (!hosts.isPending && !other), error: hosts.error, refetch: hosts.refetch } : own
  const saveOwn = useSaveMyHours()
  const updateHost = useUpdateHost()
  const save = hostId
    ? { isPending: updateHost.isPending, mutateAsync: (changes: Draft) => updateHost.mutateAsync({ id: hostId, changes }) }
    : saveOwn
  const whose = hostId ? `${other?.displayName ?? 'Their'}’s` : 'Your'
  const today = schoolToday()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [dayDraft, setDayDraft] = useState<{ on: boolean; start: string; end: string }>({ on: true, start: '15:00', end: '16:00' })
  const [addingOff, setAddingOff] = useState(false)
  const [offDate, setOffDate] = useState<string | null>(null)
  const [offReason, setOffReason] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)

  const saved: Draft | null = host.data ? { weeklyAvailability: host.data.weeklyAvailability, blockedDates: host.data.blockedDates } : null
  const current = draft ?? saved
  const dirty = Boolean(draft)
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const windowsOn = (day: number) => (current?.weeklyAvailability ?? []).filter((window) => window.day === day).sort((a, b) => a.start.localeCompare(b.start))
  const update = (change: (value: Draft) => Draft) => current && setDraft(change(current))

  const openDay = (day: number) => {
    const windows = windowsOn(day)
    setDayDraft(windows.length ? { on: true, start: windows[0].start, end: windows[windows.length - 1].end } : { on: false, start: '15:00', end: '16:00' })
    setEditingDay(day)
  }

  const applyDay = () => {
    if (editingDay === null) return
    const day = editingDay
    update((value) => ({
      ...value,
      weeklyAvailability: [
        ...value.weeklyAvailability.filter((window) => window.day !== day),
        ...(dayDraft.on ? [{ day, start: dayDraft.start, end: dayDraft.end } satisfies WeeklyWindow] : []),
      ],
    }))
    setEditingDay(null)
  }

  const submit = async () => {
    if (!draft) return
    setError(null)
    try {
      await save.mutateAsync(draft)
      haptic.success()
      setDraft(null)
      allowLeaving()
      toast('Hours saved')
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The hours didn't save. Check your connection and try again.")
    }
  }

  const notHost = host.error instanceof ApiError && host.error.status === 404
  const upcomingOff = (current?.blockedDates ?? []).filter((entry) => entry.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const editingWindows = editingDay === null ? [] : windowsOn(editingDay)

  return (
    <MobileScreen
      nav={<NavBar title={hostId ? other?.displayName ?? 'Hours' : 'Your hours'} back={{ label: hostId ? 'Hosts' : 'Meetings', onPress: router.back }} />}
      actionBar={dirty ? <ActionBar icon={Clock} summary={`${whose} hours changed`} detail="Families book in the new hours" label={save.isPending ? 'Saving…' : 'Save hours'} onPress={submit} /> : undefined}
      overlay={
        <>
          <BottomSheet
            open={editingDay !== null}
            onClose={() => setEditingDay(null)}
            detent="large"
            title={editingDay === null ? '' : DAY_NAMES[editingDay]}
            footer={
              <MobileButton fullWidth onPress={applyDay}>
                {dayDraft.on ? 'Use these hours' : `Not available on ${editingDay === null ? '' : DAY_NAMES[editingDay]}s`}
              </MobileButton>
            }
          >
            <ListGroup items={[{ title: 'Available for meetings', accessory: <Switch label="Available for meetings" value={dayDraft.on} onChange={(on) => setDayDraft((value) => ({ ...value, on }))} /> }]} />
            {editingWindows.length > 1 ? (
              <Callout tone="info" title={`You have ${editingWindows.length} times on this day`}>
                Changing it here keeps one stretch, from the first start to the last end. Set more than one on the website.
              </Callout>
            ) : null}
            {dayDraft.on ? (
              <>
                <SlotPicker
                  label="From"
                  value={dayDraft.start}
                  slots={TIMES.slice(0, -1).map((time) => ({ value: time, label: formatTime(time) }))}
                  onChange={(start) => setDayDraft((value) => ({ ...value, start, end: value.end > start ? value.end : TIMES[TIMES.indexOf(start) + 1] }))}
                />
                <SlotPicker
                  label="To"
                  value={dayDraft.end}
                  slots={TIMES.slice(1).map((time) => ({ value: time, label: formatTime(time), taken: time <= dayDraft.start }))}
                  onChange={(end) => setDayDraft((value) => ({ ...value, end }))}
                />
              </>
            ) : null}
          </BottomSheet>
          <BottomSheet
            open={addingOff}
            onClose={() => setAddingOff(false)}
            detent="large"
            title="Add a day off"
            description="No one can book a meeting with you that day."
            footer={
              <MobileButton
                fullWidth
                onPress={() => {
                  if (!offDate) {
                    haptic.error()
                    return
                  }
                  update((value) => ({
                    ...value,
                    blockedDates: [...value.blockedDates.filter((entry) => entry.date !== offDate), { date: offDate, reason: offReason.trim() }],
                  }))
                  setAddingOff(false)
                }}
              >
                {offDate ? `Add ${formatDayKey(offDate, { weekday: 'short' })}` : 'Choose a date'}
              </MobileButton>
            }
          >
            <MonthPicker value={offDate} onChange={setOffDate} today={today} min={today} />
            <MobileTextField label="Reason (optional)" hint="Only the school sees this." value={offReason} onChangeText={setOffReason} maxLength={200} />
          </BottomSheet>
          <ActionSheet
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            title={removing ? `Take ${formatDayKey(removing, { weekday: 'short' })} off your days off?` : ''}
            actions={[
              {
                label: 'Remove day off',
                tone: 'danger',
                onSelect: () => {
                  update((value) => ({ ...value, blockedDates: value.blockedDates.filter((entry) => entry.date !== removing) }))
                  setRemoving(null)
                },
              },
            ]}
          />
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title={hostId ? 'Discard changes to these hours?' : 'Discard changes to your hours?'}
            actions={[{ label: 'Discard changes', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {host.isPending ? (
        <CardSkeleton rows={6} />
      ) : notHost ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Clock} title="You're not set up to take meetings" body={host.error?.message} />
        </Surface>
      ) : host.isError ? (
        <LoadFailed what={`${whose} hours`} error={host.error} onRetry={host.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title={`${whose} hours weren’t saved`}>
              {error}
            </Callout>
          ) : null}
          <ListGroup
            header="Weekly hours"
            footer={host.data ? `Meetings are ${host.data.slotMinutes} minutes long${host.data.location ? `, at ${host.data.location}` : ''}.` : undefined}
            items={DAYS.map((day) => {
              const windows = windowsOn(day)
              return {
                title: DAY_NAMES[day],
                value: windows.length ? windows.map((window) => `${formatTime(window.start)} to ${formatTime(window.end)}`).join(', ') : 'Not available',
                onPress: () => openDay(day),
              }
            })}
          />
          <ListGroup
            header="Days off"
            footer={upcomingOff.length ? undefined : 'School holidays are already off.'}
            items={[
              ...upcomingOff.map((entry) => ({
                title: formatDayKey(entry.date, { weekday: 'short', year: entry.date.slice(0, 4) !== today.slice(0, 4) }),
                subtitle: entry.reason || undefined,
                icon: CalendarOff,
                tile: 1 as const,
                onPress: () => setRemoving(entry.date),
              })),
              {
                title: 'Add a day off',
                icon: Plus,
                tile: 1 as const,
                onPress: () => {
                  setOffDate(null)
                  setOffReason('')
                  setAddingOff(true)
                },
              },
            ]}
          />
        </>
      )}
    </MobileScreen>
  )
}
