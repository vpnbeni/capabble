import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { dayKeyAdd, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalAppointmentHosts, usePortalAppointments, usePortalAppointmentSlots, useRequestAppointment } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  Avatar,
  BottomSheet,
  Callout,
  ChipRail,
  haptic,
  ListGroup,
  MobileScreen,
  MobileTextField,
  NavBar,
  OptionList,
  SegmentedControl,
  SlotPicker,
  Text,
  useToast,
} from '@/ui'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekday = (key: string) => new Date(`${key}T00:00:00.000Z`).getUTCDay()

type Mode = 'in_person' | 'phone' | 'video'

/** Request a meeting for one child with one person, at a free time. Mirrors the web portal's request sheet. */
export default function NewMeetingScreen() {
  const router = useRouter()
  const toast = useToast()
  const { child } = usePortal()
  const settings = usePortalAppointments()
  const hosts = usePortalAppointmentHosts(child?.studentId)
  const [hostId, setHostId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [purpose, setPurpose] = useState('')
  const [mode, setMode] = useState<Mode>('in_person')
  const [agenda, setAgenda] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<{ host?: string; time?: string; purpose?: string; form?: string }>({})
  const [picking, setPicking] = useState<'host' | 'purpose' | null>(null)
  const request = useRequestAppointment()

  const host = hosts.data?.find((row) => row._id === hostId)
  const maxDays = settings.data?.maxAdvanceDays ?? 30
  // The next school days this person meets on, from tomorrow.
  const dates = useMemo(() => {
    if (!host) return []
    const today = schoolToday()
    return Array.from({ length: maxDays }, (_, index) => dayKeyAdd(today, index + 1))
      .filter((key) => host.days.includes(weekday(key)))
      .slice(0, 14)
  }, [host, maxDays])
  const day = date && dates.includes(date) ? date : (dates[0] ?? '')
  const slots = usePortalAppointmentSlots(child?.studentId, hostId, day)

  const submit = async () => {
    if (!child) return
    const found: typeof errors = {}
    if (!hostId) found.host = 'Choose who you want to meet'
    else if (!startTime) found.time = 'Choose a time'
    if (!purpose) found.purpose = 'Choose what it is about'
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      const meeting = await request.mutateAsync({
        studentId: child.studentId,
        payload: { hostId, date: day, startTime, purpose, agenda: agenda.trim(), mode, phone: phone.trim() },
      })
      haptic.success()
      toast(meeting.status === 'confirmed' ? 'Your meeting is confirmed.' : 'Request sent. The school will confirm it.')
      router.back()
    } catch (error) {
      haptic.error()
      setErrors({ form: error instanceof ApiError ? error.message : "Couldn't send the request. Try again." })
      slots.refetch()
    }
  }

  const noHosts = hosts.isSuccess && hosts.data.length === 0

  const hostDays = host?.days.length ? [...host.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join(', ') : ''
  const slotList = slots.isPending || slots.data?.closed ? [] : (slots.data?.slots ?? [])

  return (
    <MobileScreen
      nav={<NavBar title="Request a meeting" back={{ label: 'Meetings', onPress: router.back }} trailing={<ChildSwitcher />} />}
      actionBar={
        host && child ? (
          <ActionBar
            summary={startTime ? `${formatDayKey(day, { weekday: 'short' })} · ${formatTime(startTime)}` : 'Choose a time'}
            detail={host.displayName}
            label={request.isPending ? 'Sending…' : 'Send'}
            onPress={request.isPending ? () => {} : submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={picking === 'host'} onClose={() => setPicking(null)} title="Meet with">
            <OptionList
              label="Meet with"
              value={hostId || null}
              onChange={(value) => {
                setHostId(value)
                setDate('')
                setStartTime('')
                setErrors({})
                setPicking(null)
              }}
              options={(hosts.data ?? []).map((row) => ({
                value: row._id,
                label: row.displayName,
                meta: [row.title, row.location].filter(Boolean).join(' · ') || undefined,
                avatar: <Avatar name={row.displayName} size={32} />,
              }))}
            />
          </BottomSheet>
          <BottomSheet open={picking === 'purpose'} onClose={() => setPicking(null)} title="About">
            <OptionList
              label="About"
              value={purpose || null}
              onChange={(value) => {
                setPurpose(value)
                setErrors(({ purpose: _fixed, ...rest }) => rest)
                setPicking(null)
              }}
              options={(settings.data?.purposes ?? []).map((value) => ({ value, label: value }))}
            />
          </BottomSheet>
        </>
      }
    >
      {!child ? (
        <NoChild />
      ) : hosts.isPending || settings.isPending ? (
        <CardSkeleton rows={4} />
      ) : hosts.isError ? (
        <LoadFailed what="The people you can meet" error={hosts.error} onRetry={hosts.refetch} />
      ) : noHosts ? (
        <Callout tone="info" title="No one is taking requests in the app for this class">
          Call the school office to set up a meeting.
        </Callout>
      ) : (
        <>
          {errors.form ? <Callout tone="danger" title={errors.form} /> : null}
          <ListGroup
            header={`About ${child.name}`}
            footer={errors.host ?? (hostDays ? `Meets on ${hostDays}` : undefined)}
            items={[
              host
                ? {
                    title: host.displayName,
                    subtitle: [host.title, host.location].filter(Boolean).join(' · ') || undefined,
                    avatar: <Avatar name={host.displayName} size={36} />,
                    onPress: () => setPicking('host'),
                  }
                : { title: 'Choose who to meet', tone: errors.host ? 'danger' : 'default', onPress: () => setPicking('host') },
            ]}
          />

          {host ? (
            <View style={{ gap: space['space-3'] }}>
              <Text variant="label" style={{ fontSize: 14, lineHeight: 20 }}>
                Date
              </Text>
              {dates.length ? (
                <ChipRail
                  label="Date"
                  value={day}
                  onChange={(value) => {
                    setDate(value)
                    setStartTime('')
                  }}
                  items={dates.map((key) => ({ id: key, label: formatDayKey(key, { weekday: 'short' }) }))}
                />
              ) : (
                <Text variant="body" tone="muted">
                  No days open in the next {maxDays} days.
                </Text>
              )}
              {day ? (
                <SlotPicker
                  label="Time"
                  slots={slotList.map((slot) => ({ value: slot.start, label: formatTime(slot.start), taken: !slot.open }))}
                  value={startTime || null}
                  onChange={(value) => {
                    setStartTime(value)
                    setErrors(({ time: _fixed, ...rest }) => rest)
                  }}
                  emptyText={slots.isPending ? 'Finding free times…' : slots.data?.reason || 'No times free on this day. Try another date.'}
                  hint={errors.time ?? (host.location ? `Meetings are at ${host.location}.` : undefined)}
                />
              ) : null}
            </View>
          ) : null}

          <ListGroup
            header="About"
            footer={errors.purpose}
            items={[{ title: purpose || 'Choose what it is about', tone: errors.purpose ? 'danger' : 'default', onPress: () => setPicking('purpose') }]}
          />
          <View style={{ gap: space['space-3'] }}>
            <Text variant="label" style={{ fontSize: 14, lineHeight: 20 }}>
              How
            </Text>
            <SegmentedControl<Mode>
              label="How"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'in_person', label: 'At school' },
                { value: 'phone', label: 'Phone' },
                { value: 'video', label: 'Video' },
              ]}
            />
          </View>
          <MobileTextField label="Anything to share first" hint="Optional" value={agenda} onChangeText={setAgenda} multiline maxLength={1000} />
          <MobileTextField
            label="Phone"
            type="tel"
            hint="Optional. Leave empty to use the number the school has."
            value={phone}
            onChangeText={setPhone}
            textContentType="telephoneNumber"
          />
        </>
      )}
    </MobileScreen>
  )
}
