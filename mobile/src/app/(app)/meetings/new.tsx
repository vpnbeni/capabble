import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { dayKeyAdd, formatDayKey, schoolToday } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalAppointmentHosts, usePortalAppointments, usePortalAppointmentSlots, useRequestAppointment } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { space } from '@/theme/tokens'
import { Banner, Button, Card, Chips, SegmentedControl, SelectField, Screen, SlotPicker, Text, TextField, useToast } from '@/ui'

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
      toast(meeting.status === 'confirmed' ? 'Your meeting is confirmed.' : 'Request sent. The school will confirm it.')
      router.back()
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "Couldn't send the request. Try again." })
      slots.refetch()
    }
  }

  const noHosts = hosts.isSuccess && hosts.data.length === 0

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen title="Request a meeting" onBack={router.back} headerAction={<ChildSwitcher />}>
        {!child ? (
          <NoChild />
        ) : hosts.isPending || settings.isPending ? (
          <CardSkeleton rows={4} />
        ) : hosts.isError ? (
          <LoadFailed what="The people you can meet" error={hosts.error} onRetry={hosts.refetch} />
        ) : noHosts ? (
          <Banner tone="info" title="No one is taking requests in the app for this class">
            Call the school office to set up a meeting.
          </Banner>
        ) : (
          <>
            <Text variant="body" tone="muted">
              About {child.name}.
            </Text>
            {errors.form ? <Banner tone="danger" title={errors.form} /> : null}
            <Card>
              <View style={{ gap: space['space-4'] }}>
                <SelectField
                  label="Meet with"
                  placeholder="Choose a person"
                  options={(hosts.data ?? []).map((row) => ({ value: row._id, label: row.displayName, meta: [row.title, row.location].filter(Boolean).join(' · ') || undefined }))}
                  value={hostId}
                  onChange={(value) => {
                    setHostId(value)
                    setDate('')
                    setStartTime('')
                    setErrors({})
                  }}
                  error={errors.host}
                  hint={host?.days.length ? `Meets on ${[...host.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join(', ')}` : undefined}
                />
                {host ? (
                  <View style={{ gap: space['space-1'] + 2 }}>
                    <Text variant="label">Date</Text>
                    {dates.length ? (
                      <Chips
                        label="Date"
                        value={day}
                        onChange={(value) => {
                          setDate(value)
                          setStartTime('')
                        }}
                        options={dates.map((key) => ({ value: key, label: formatDayKey(key, { weekday: 'short' }) }))}
                      />
                    ) : (
                      <Text variant="body" tone="muted">
                        No days open in the next {maxDays} days.
                      </Text>
                    )}
                  </View>
                ) : null}
                {host && day ? (
                  <SlotPicker
                    label="Time"
                    slots={slots.isPending || slots.data?.closed ? [] : (slots.data?.slots ?? [])}
                    value={startTime}
                    onChange={(value) => {
                      setStartTime(value)
                      setErrors(({ time: _fixed, ...rest }) => rest)
                    }}
                    emptyText={slots.isPending ? 'Finding free times…' : slots.data?.reason || 'No times free on this day. Try another date.'}
                    hint={errors.time ?? (host.location ? `Meetings are at ${host.location}.` : undefined)}
                  />
                ) : null}
              </View>
            </Card>
            <Card>
              <View style={{ gap: space['space-4'] }}>
                <SelectField
                  label="About"
                  options={(settings.data?.purposes ?? []).map((value) => ({ value, label: value }))}
                  value={purpose}
                  onChange={(value) => {
                    setPurpose(value)
                    setErrors(({ purpose: _fixed, ...rest }) => rest)
                  }}
                  error={errors.purpose}
                />
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
                <TextField label="Anything to share first" hint="Optional" value={agenda} onChangeText={setAgenda} multiline maxLength={1000} />
                <TextField
                  label="Phone"
                  hint="Optional. Leave empty to use the number the school has."
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                />
              </View>
            </Card>
            <Button label="Send request" onPress={submit} loading={request.isPending} fullWidth />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}
