import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { CalendarPlus, UserPlus } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, dayKeyAdd, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { AppointmentMode, DeskStudent, VisitorType } from '@/services/appntService'
import { MODE_LABEL, VISITOR_LABEL } from '@/staff/MeetingSheet'
import { useBookMeeting, useDeskSettings, useDeskStudents, useHostSlots, useMeetingHosts } from '@/staff/queries'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  OptionList,
  SearchBar,
  SegmentedControl,
  SlotPicker,
  StatusView,
  haptic,
  useToast,
} from '@/ui'

type Sheet = 'host' | 'type' | 'student' | 'date' | 'purpose' | null
const TYPES: VisitorType[] = ['parent', 'visitor', 'staff', 'vendor', 'other']

/**
 * The front desk books a meeting for someone (a parent about their child, a visitor, a vendor)
 * with a host at a free time; with `?walkIn=1` the person is here now and is checked in at once.
 */
export default function BookMeetingScreen() {
  const router = useRouter()
  const toast = useToast()
  const { walkIn: walkInParam } = useLocalSearchParams<{ walkIn?: string }>()
  const walkIn = walkInParam === '1'
  const today = schoolToday()
  const hosts = useMeetingHosts()
  const settings = useDeskSettings()
  const book = useBookMeeting()

  const [hostId, setHostId] = useState('')
  const [visitorType, setVisitorType] = useState<VisitorType>('parent')
  const [student, setStudent] = useState<DeskStudent | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [date, setDate] = useState(walkIn ? today : dayKeyAdd(today, 1))
  const [startTime, setStartTime] = useState('')
  const [purpose, setPurpose] = useState('')
  const [mode, setMode] = useState<AppointmentMode>('in_person')
  const [agenda, setAgenda] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [query, setQuery] = useState('')
  const [errors, setErrors] = useState<{ host?: string; name?: string; time?: string; purpose?: string; form?: string }>({})
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)

  const students = useDeskStudents(visitorType === 'parent')
  const slots = useHostSlots(walkIn ? '' : hostId, date)
  const host = hosts.data?.find((row) => row._id === hostId)
  const dirty = !done && Boolean(hostId || name || student || agenda)
  const allowLeaving = usePreventRemove(dirty && !book.isPending, ({ repeat }) => setLeaving(() => repeat))

  const chooseStudent = (picked: DeskStudent) => {
    setStudent(picked)
    // The guardian is who usually comes; the desk can change it.
    setName(picked.guardianName || picked.fatherName || picked.motherName || '')
    setPhone(picked.guardianPhone || '')
    setSheet(null)
    setQuery('')
  }

  const submit = async () => {
    const problems: typeof errors = {}
    if (!hostId) problems.host = 'Choose who they are meeting'
    if (!name.trim()) problems.name = visitorType === 'parent' ? "Enter the parent's name" : "Enter the visitor's name"
    if (!walkIn && !startTime) problems.time = 'Choose a time'
    if (!purpose) problems.purpose = 'Choose what it is about'
    setErrors(problems)
    if (Object.keys(problems).length) {
      haptic.error()
      return
    }
    try {
      await book.mutateAsync({
        walkIn,
        input: {
          hostId,
          ...(walkIn ? {} : { date, startTime }),
          visitorType,
          visitor: { name: name.trim(), phone: phone.trim(), organisation: organisation.trim(), relation: visitorType === 'parent' ? 'Guardian' : '' },
          studentId: visitorType === 'parent' && student ? student._id : undefined,
          purpose,
          agenda: agenda.trim(),
          mode: walkIn ? 'in_person' : mode,
        },
      })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(walkIn ? `${name.trim()} checked in for ${host?.displayName ?? 'the meeting'}` : `Booked with ${host?.displayName} on ${formatDayKey(date, { weekday: 'short' })}, ${formatTime(startTime)}`)
      router.back()
    } catch (error) {
      haptic.error()
      setErrors({ form: error instanceof ApiError ? error.message : "It wasn't booked. Check your connection and try again." })
    }
  }

  const list = (students.data?.items ?? []).filter((row) => {
    const q = query.trim().toLowerCase()
    return q.length >= 2 && `${row.name} ${row.rollNumber ?? ''} ${row.guardianName ?? ''} ${row.class ?? ''}-${row.section ?? ''}`.toLowerCase().includes(q)
  })
  const free = (slots.data?.slots ?? []).filter((slot) => slot.state === 'free')

  const sheetBody = () => {
    switch (sheet) {
      case 'host':
        return (
          <OptionList
            label="Meeting"
            value={hostId || null}
            onChange={(value) => {
              setHostId(value)
              setStartTime('')
              setErrors((current) => ({ ...current, host: undefined }))
              setSheet(null)
            }}
            options={(hosts.data ?? []).map((row) => ({ value: row._id, label: row.displayName, meta: [row.title, row.absentToday ? 'Absent today' : null, row.location].filter(Boolean).join(' · ') || undefined }))}
          />
        )
      case 'type':
        return (
          <OptionList
            label="Who is visiting"
            value={visitorType}
            onChange={(value) => {
              setVisitorType(value)
              if (value !== 'parent') setStudent(null)
              setSheet(null)
            }}
            options={TYPES.map((value) => ({ value, label: VISITOR_LABEL[value] }))}
          />
        )
      case 'student':
        return (
          <View style={{ gap: space['space-3'] }}>
            <SearchBar label="Find a student" placeholder="Name, roll number or guardian" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
            {students.isPending ? (
              <CardSkeleton rows={3} />
            ) : query.trim().length < 2 ? (
              <StatusView compact kind="empty" title="Type at least two letters" body="Search by the child's name, roll number or the guardian's name." />
            ) : list.length ? (
              <ListGroup
                items={list.slice(0, 30).map((row) => ({
                  title: row.name,
                  subtitle: [classLabel(row.class, row.section), row.guardianName ? `Guardian ${row.guardianName}` : null].filter(Boolean).join(' · '),
                  lines: 2,
                  onPress: () => chooseStudent(row),
                }))}
              />
            ) : (
              <StatusView compact kind="empty" title="No student found" body="Check the spelling, or book them as a visitor." />
            )}
          </View>
        )
      case 'date':
        return (
          <MonthPicker
            value={date}
            today={today}
            min={today}
            onChange={(value) => {
              setDate(value)
              setStartTime('')
              setSheet(null)
            }}
          />
        )
      case 'purpose':
        return (
          <OptionList
            label="About"
            value={purpose || null}
            onChange={(value) => {
              setPurpose(value)
              setErrors((current) => ({ ...current, purpose: undefined }))
              setSheet(null)
            }}
            options={(settings.data?.purposes ?? []).map((value) => ({ value, label: value }))}
          />
        )
      default:
        return null
    }
  }

  const TITLES: Record<Exclude<Sheet, null>, string> = { host: 'Meeting', type: 'Who is visiting', student: 'Which child', date: 'Date', purpose: 'About' }

  return (
    <MobileScreen
      nav={<NavBar title={walkIn ? 'Walk-in' : 'Book a meeting'} back={{ label: 'Meetings', onPress: router.back }} />}
      actionBar={
        hosts.data ? (
          <ActionBar
            icon={walkIn ? UserPlus : CalendarPlus}
            summary={name.trim() || (walkIn ? 'Walk-in' : 'New meeting')}
            detail={[host?.displayName ?? 'Choose who', walkIn ? 'now' : startTime ? `${formatDayKey(date, { weekday: 'short' })}, ${formatTime(startTime)}` : 'choose a time'].join(' · ')}
            label={book.isPending ? 'Saving…' : walkIn ? 'Check in' : 'Book'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet ? TITLES[sheet] : ''} detent={sheet === 'student' || sheet === 'host' ? 'large' : 'medium'}>
            {sheetBody()}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard this booking?"
            message="It hasn't been saved."
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep booking"
          />
        </>
      }
    >
      {hosts.isPending || settings.isPending ? (
        <CardSkeleton rows={4} />
      ) : hosts.isError ? (
        <LoadFailed what="Who takes meetings" error={hosts.error} onRetry={hosts.refetch} />
      ) : !hosts.data?.length ? (
        <StatusView compact kind="empty" title="Nobody takes meetings yet" body="Add hosts first: the principal turns people on under Meetings → Hosts." />
      ) : (
        <>
          {errors.form ? (
            <Callout tone="danger" title="Not booked">
              {errors.form}
            </Callout>
          ) : errors.host || errors.time || errors.purpose ? (
            <Callout tone="danger" title="Fill in the meeting">
              {[errors.host, errors.time, errors.purpose].filter(Boolean).join('. ')}
            </Callout>
          ) : host?.absentToday && (walkIn || date === today) ? (
            <Callout tone="warning" title={`${host.displayName} is absent today`}>
              Book another day, or someone else.
            </Callout>
          ) : null}

          <ListGroup
            header="Who"
            items={[
              { title: 'Meeting', value: host?.displayName ?? 'Choose', onPress: () => setSheet('host') },
              { title: 'Visiting', value: VISITOR_LABEL[visitorType], onPress: () => setSheet('type') },
              ...(visitorType === 'parent'
                ? [{ title: 'Child', value: student ? `${student.name}, ${classLabel(student.class, student.section)}` : 'Choose', lines: 2, onPress: () => setSheet('student') }]
                : []),
            ]}
          />
          <View style={{ gap: space['space-4'] }}>
            <MobileTextField label={visitorType === 'parent' ? 'Parent’s name' : 'Name'} value={name} onChangeText={setName} error={errors.name} maxLength={120} />
            <MobileTextField label="Phone (optional)" type="tel" value={phone} onChangeText={setPhone} maxLength={20} />
            {visitorType === 'vendor' || visitorType === 'visitor' ? (
              <MobileTextField label="Organisation (optional)" value={organisation} onChangeText={setOrganisation} maxLength={120} />
            ) : null}
          </View>

          {walkIn ? null : (
            <>
              <ListGroup header="When" items={[{ title: 'Date', value: formatDayKey(date, { weekday: 'short' }), onPress: () => setSheet('date') }]} />
              {!hostId ? null : slots.isPending ? (
                <CardSkeleton rows={2} />
              ) : slots.data?.closed || !free.length ? (
                <Callout tone="neutral" title="No free time on this day">
                  {slots.data?.reason || 'Every time is booked or taken by teaching. Choose another day.'}
                </Callout>
              ) : (
                <SlotPicker
                  label="Time"
                  value={startTime || null}
                  onChange={setStartTime}
                  slots={(slots.data?.slots ?? []).filter((slot) => slot.state !== 'past').map((slot) => ({ value: slot.start, label: formatTime(slot.start), taken: slot.state !== 'free' }))}
                />
              )}
              <SegmentedControl
                label="How"
                value={mode}
                onChange={setMode}
                options={(['in_person', 'phone', 'video'] as AppointmentMode[]).map((value) => ({ value, label: value === 'in_person' ? 'In person' : MODE_LABEL[value].replace(' call', '') }))}
              />
            </>
          )}

          <ListGroup header="About" items={[{ title: 'Purpose', value: purpose || 'Choose', onPress: () => setSheet('purpose') }]} />
          <MobileTextField label="Notes for the host (optional)" value={agenda} onChangeText={setAgenda} multiline maxLength={1000} />
        </>
      )}
    </MobileScreen>
  )
}
