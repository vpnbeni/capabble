import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, CalendarPlus, Plus, Trash2, UserRoundPlus } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Combobox,
  DetailList,
  Dialog,
  RadioGroup,
  Select,
  Sheet,
  SlotPicker,
  TextArea,
  TextField,
  formatDate,
  formatTime,
  type SlotPickerSlot,
  type Tone,
} from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useAppntHosts,
  useAppntSettings,
  useAppointmentAction,
  useBookAppointment,
  useReschedule,
  useSaveNotes,
  useSlots,
  useStaffOptions,
  useStudentOptions,
} from '@/hooks/useAppnt'
import type {
  Appointment,
  AppointmentAction,
  AppointmentHost,
  AppointmentMode,
  AppointmentStatus,
  HostPayload,
  Slot,
  VisitorType,
  WeeklyWindow,
} from '@/services/appntService'
import { classLabel } from '@/utils/classLabel'
import './appnt.css'

export const P = {
  view: 'appnt.appointments.view',
  book: 'appnt.appointments.book',
  manage: 'appnt.appointments.manage',
  host: 'appnt.appointments.host',
  notes: 'appnt.appointments.notes',
  settings: 'appnt.appointments.settings',
  report: 'appnt.appointments.report',
} as const

export const errorMessage = (error: unknown, fallback = 'Something went wrong. Try again.') => {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message || (error as Error)?.message || fallback
}

export const errorCode = (error: unknown) =>
  (error as { response?: { data?: { errorCode?: string } } })?.response?.data?.errorCode

const pad = (n: number) => String(n).padStart(2, '0')
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayKey = () => dateKey(new Date())
export const addDays = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00`)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}

/** "Mon 19 Oct" inside the current year, with the year otherwise. */
export const dayLabel = (key?: string) => {
  if (!key) return '—'
  const d = new Date(`${key}T00:00:00`)
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' })
  return `${weekday} ${formatDate(d, { year: key.slice(0, 4) !== String(new Date().getFullYear()) })}`
}

export const timeRange = (a: Pick<Appointment, 'startTime' | 'endTime'>) => `${formatTime(a.startTime)} – ${formatTime(a.endTime)}`

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const STATUS_META: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  checked_in: { label: 'Checked in', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_show: { label: 'No-show', tone: 'danger' },
}

export const StatusBadge: React.FC<{ status: AppointmentStatus }> = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.confirmed
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export const VISITOR_LABEL: Record<VisitorType, string> = {
  parent: 'Parent',
  visitor: 'Visitor',
  staff: 'Staff',
  vendor: 'Vendor',
  other: 'Other',
}

export const MODE_LABEL: Record<AppointmentMode, string> = {
  in_person: 'In person',
  phone: 'Phone call',
  video: 'Video call',
}

/** Who the visitor is, in one line: "Parent of Aarav Shah · Class 7-A". */
export const visitorDetail = (a: Appointment) => {
  const s = a.studentSnapshot
  if (a.visitorType === 'parent' && s?.name) {
    return `${a.visitor.relation ? `${a.visitor.relation} of` : 'Parent of'} ${s.name} · ${classLabel(s.className, s.section)}`
  }
  if (a.visitor.organisation) return `${VISITOR_LABEL[a.visitorType]} · ${a.visitor.organisation}`
  return VISITOR_LABEL[a.visitorType]
}

/** Server slot → kit slot. Teaching periods can be overridden; everything else busy is final. */
export const toPickerSlots = (slots: Slot[]): SlotPickerSlot[] => slots.map((slot) => ({
  start: slot.start,
  end: slot.end,
  state: slot.state === 'free' ? 'free' : slot.state === 'teaching' ? 'caution' : 'busy',
  reason: slot.reason,
}))

export const hostOptions = (hosts: AppointmentHost[]) => hosts.map((host) => ({
  value: host._id,
  label: host.displayName,
  meta: [host.title, host.absentToday ? 'Absent today' : ''].filter(Boolean).join(' · '),
}))

export const describeHours = (windows: WeeklyWindow[]) => {
  if (!windows.length) return 'No hours set'
  const byDay = new Map<number, string[]>()
  windows.forEach((w) => byDay.set(w.day, [...(byDay.get(w.day) || []), `${formatTime(w.start)}–${formatTime(w.end)}`]))
  const groups = new Map<string, number[]>()
  ;[...byDay.entries()].sort((a, b) => ((a[0] + 6) % 7) - ((b[0] + 6) % 7)).forEach(([day, ranges]) => {
    const key = ranges.join(', ')
    groups.set(key, [...(groups.get(key) || []), day])
  })
  return [...groups.entries()].map(([ranges, days]) => `${days.map((d) => WEEKDAYS_SHORT[d]).join(', ')} ${ranges}`).join(' · ')
}

// ── Booking ─────────────────────────────────────────────────────────────────

type BookingDraft = {
  visitorType: VisitorType
  studentId: string
  staffId: string
  name: string
  phone: string
  email: string
  relation: string
  organisation: string
  hostId: string
  date: string
  startTime: string
  purpose: string
  mode: AppointmentMode
  agenda: string
}

const emptyBooking = (hostId = '', date = todayKey()): BookingDraft => ({
  visitorType: 'parent',
  studentId: '',
  staffId: '',
  name: '',
  phone: '',
  email: '',
  relation: '',
  organisation: '',
  hostId,
  date,
  startTime: '',
  purpose: '',
  mode: 'in_person',
  agenda: '',
})

export const BookAppointmentSheet: React.FC<{
  open: boolean
  onClose: () => void
  walkIn?: boolean
  defaultHostId?: string
  defaultDate?: string
  onBooked?: (appointment: Appointment) => void
}> = ({ open, onClose, walkIn = false, defaultHostId = '', defaultDate, onBooked }) => {
  const { can } = usePermissions()
  const canBookAnyone = can([P.book, P.manage])
  const canOverride = can(P.manage)
  const [draft, setDraft] = useState<BookingDraft>(() => emptyBooking(defaultHostId, defaultDate))
  const [errors, setErrors] = useState<Partial<Record<keyof BookingDraft, string>>>({})
  const hosts = useAppntHosts(false, open)
  const settings = useAppntSettings(open)
  const students = useStudentOptions(open && canBookAnyone)
  const staff = useStaffOptions(open && canBookAnyone && draft.visitorType === 'staff')
  const slots = useSlots(walkIn ? '' : draft.hostId, walkIn ? '' : draft.date)
  const book = useBookAppointment()

  // Hosts without booking rights can only add to their own calendar.
  const hostList = useMemo(() => (hosts.data || []).filter((host) => canBookAnyone || host.mine), [hosts.data, canBookAnyone])
  const ownHostId = hostList.find((host) => host.mine)?._id

  useEffect(() => {
    if (!open) return
    setDraft(emptyBooking(defaultHostId || (!canBookAnyone ? ownHostId || '' : ''), defaultDate || todayKey()))
    setErrors({})
  }, [open, defaultHostId, defaultDate, canBookAnyone, ownHostId])

  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const studentList = students.data?.items || []
  const studentOptions = useMemo(() => studentList.map((s) => ({
    value: s._id,
    label: s.name,
    meta: [classLabel(s.class, s.section), s.rollNumber && `Adm ${s.rollNumber}`].filter(Boolean).join(' · '),
    keywords: [s.rollNumber, s.fatherName, s.guardianPhone].filter(Boolean).join(' '),
  })), [studentList])

  const pickStudent = (id: string) => {
    const s = studentList.find((row) => row._id === id)
    setDraft((d) => ({
      ...d,
      studentId: id,
      name: s ? (s.guardianName || s.fatherName || d.name) : d.name,
      relation: s ? (s.guardianName ? 'Guardian' : 'Father') : d.relation,
      phone: s?.guardianPhone || d.phone,
      email: s?.guardianEmail || d.email,
    }))
  }

  const pickStaff = (id: string) => {
    const person = (staff.data || []).find((row) => row._id === id)
    setDraft((d) => ({ ...d, staffId: id, name: person?.name || d.name, email: person?.email || d.email }))
  }

  const pickerSlots = toPickerSlots(slots.data?.slots || [])
  const chosen = pickerSlots.find((slot) => slot.start === draft.startTime)
  const purposes = settings.data?.purposes || []
  const selectedHost = hostList.find((host) => host._id === draft.hostId)

  const submit = async () => {
    const next: typeof errors = {}
    if (!draft.name.trim()) next.name = "Enter the visitor's name"
    if (!draft.hostId) next.hostId = 'Choose who they are meeting'
    if (!walkIn && !draft.date) next.date = 'Choose a date'
    if (!walkIn && !draft.startTime) next.startTime = 'Choose a time'
    if (!draft.purpose) next.purpose = 'Choose a purpose'
    if (draft.phone && !/^[+\d][\d\s-]{6,18}$/.test(draft.phone.trim())) next.phone = 'Enter a valid phone number'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      const appointment = await book.mutateAsync({
        walkIn,
        payload: {
          hostId: draft.hostId,
          ...(walkIn ? {} : { date: draft.date, startTime: draft.startTime }),
          visitorType: draft.visitorType,
          visitor: {
            name: draft.name.trim(),
            phone: draft.phone.trim(),
            email: draft.email.trim(),
            relation: draft.visitorType === 'parent' ? draft.relation : '',
            organisation: ['visitor', 'vendor', 'other'].includes(draft.visitorType) ? draft.organisation.trim() : '',
          },
          studentId: draft.visitorType === 'parent' ? draft.studentId || undefined : undefined,
          staffId: draft.visitorType === 'staff' ? draft.staffId || undefined : undefined,
          purpose: draft.purpose,
          agenda: draft.agenda.trim(),
          mode: walkIn ? 'in_person' : draft.mode,
          overrideTeaching: chosen?.state === 'caution',
        },
      })
      toast.success(walkIn ? `${draft.name.trim()} checked in to meet ${selectedHost?.displayName || 'the host'}.` : `Booked ${appointment.refNo}.`)
      onBooked?.(appointment)
      onClose()
    } catch (error) {
      if (errorCode(error) === 'slot_taken') slots.refetch()
      toast.error(errorMessage(error, "Couldn't book the appointment."))
    }
  }

  const noHosts = hosts.isSuccess && hostList.length === 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      icon={walkIn ? UserRoundPlus : CalendarPlus}
      title={walkIn ? 'Check in a walk-in visitor' : 'Book an appointment'}
      description={walkIn ? 'For someone at the front desk now. They are checked in straight away.' : undefined}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={book.isPending} disabled={noHosts}>
            {walkIn ? 'Check in visitor' : 'Book appointment'}
          </Button>
        </>
      }
    >
      {noHosts ? (
        <Banner tone="warning" title="Nobody is taking appointments yet">
          Add the principal or a teacher under Who takes appointments first.
        </Banner>
      ) : null}

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Who is visiting</h3>
        <RadioGroup
          orientation="horizontal"
          options={(Object.keys(VISITOR_LABEL) as VisitorType[]).map((value) => ({ value, label: VISITOR_LABEL[value] }))}
          value={draft.visitorType}
          onChange={(value) => set('visitorType', value as VisitorType)}
        />
        {draft.visitorType === 'parent' && canBookAnyone && students.data?.available ? (
          <Combobox
            label="Student"
            hint="Fills in the parent's name and phone from the student record."
            options={studentOptions}
            value={draft.studentId}
            onChange={pickStudent}
            placeholder="Search by name or admission no."
          />
        ) : null}
        {draft.visitorType === 'staff' && canBookAnyone ? (
          <Combobox
            label="Staff member"
            options={(staff.data || []).map((row) => ({ value: row._id, label: row.name, meta: row.designation }))}
            value={draft.staffId}
            onChange={pickStaff}
            placeholder="Search staff by name"
          />
        ) : null}
        <div className="cb-form-grid">
          <TextField label="Name" required value={draft.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          {draft.visitorType === 'parent' ? (
            <Select
              label="Relation"
              placeholder="Choose"
              options={['Father', 'Mother', 'Guardian']}
              value={draft.relation}
              onChange={(e) => set('relation', e.target.value)}
            />
          ) : draft.visitorType !== 'staff' ? (
            <TextField label="Organisation" hint="Optional" value={draft.organisation} onChange={(e) => set('organisation', e.target.value)} />
          ) : null}
          <TextField label="Phone" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
          <TextField label="Email" type="email" hint="Gets the confirmation" value={draft.email} onChange={(e) => set('email', e.target.value)} />
        </div>
      </div>

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Meeting</h3>
        <div className="cb-form-grid">
          <Combobox
            label="Meeting with"
            required
            options={hostOptions(hostList)}
            value={draft.hostId}
            onChange={(value) => setDraft((d) => ({ ...d, hostId: value, startTime: '' }))}
            placeholder={hosts.isLoading ? 'Loading…' : 'Choose a person'}
            clearable={false}
            error={errors.hostId}
          />
          {walkIn ? null : (
            <TextField
              label="Date"
              type="date"
              required
              min={todayKey()}
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value, startTime: '' }))}
              error={errors.date}
            />
          )}
        </div>
        {selectedHost?.absentToday && (walkIn || draft.date === todayKey()) ? (
          <Banner tone="warning" title={`${selectedHost.displayName} is marked absent today`}>Choose another day or another person.</Banner>
        ) : null}
        {walkIn || !draft.hostId ? null : (
          <SlotPicker
            label="Time"
            required
            slots={pickerSlots}
            value={draft.startTime}
            onChange={(value) => set('startTime', value)}
            allowCaution={canOverride || Boolean(selectedHost?.mine)}
            loading={slots.isLoading}
            emptyText={slots.data?.reason || 'No times available on this day.'}
            hint={slots.data?.timetableLinked ? 'Teaching periods come from the published timetable.' : undefined}
            error={errors.startTime}
          />
        )}
        <div className="cb-form-grid">
          <Select
            label="Purpose"
            required
            placeholder="Choose a purpose"
            options={purposes}
            value={draft.purpose}
            onChange={(e) => set('purpose', e.target.value)}
            error={errors.purpose}
          />
          {walkIn ? null : (
            <Select
              label="How"
              options={(Object.keys(MODE_LABEL) as AppointmentMode[]).map((value) => ({ value, label: MODE_LABEL[value] }))}
              value={draft.mode}
              onChange={(e) => set('mode', e.target.value as AppointmentMode)}
            />
          )}
        </div>
        <TextArea label="What it's about" hint="Optional. Visible to the person they're meeting." value={draft.agenda} onChange={(e) => set('agenda', e.target.value)} />
      </div>
    </Sheet>
  )
}

// ── Appointment detail ──────────────────────────────────────────────────────

const ACTION_LABEL: Record<AppointmentAction, string> = {
  confirm: 'Confirmed.',
  decline: 'Request declined.',
  'check-in': 'Checked in.',
  complete: 'Marked as completed.',
  'no-show': 'Marked as no-show.',
  cancel: 'Appointment cancelled.',
}

export const RescheduleDialog: React.FC<{ appointment: Appointment | null; onClose: () => void }> = ({ appointment, onClose }) => {
  const { can } = usePermissions()
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const slots = useSlots(appointment?.host || '', date)
  const reschedule = useReschedule()
  useEffect(() => {
    if (appointment) {
      setDate(appointment.date >= todayKey() ? appointment.date : todayKey())
      setStartTime('')
    }
  }, [appointment])
  const pickerSlots = toPickerSlots(slots.data?.slots || [])
  const chosen = pickerSlots.find((slot) => slot.start === startTime)
  const save = async () => {
    if (!appointment || !startTime) return
    try {
      await reschedule.mutateAsync({ id: appointment._id, date, startTime, overrideTeaching: chosen?.state === 'caution' })
      toast.success(`Moved to ${dayLabel(date)}, ${formatTime(startTime)}.`)
      onClose()
    } catch (error) {
      if (errorCode(error) === 'slot_taken') slots.refetch()
      toast.error(errorMessage(error, "Couldn't move the appointment."))
    }
  }
  return (
    <Dialog
      open={Boolean(appointment)}
      onClose={onClose}
      title="Move appointment"
      description={appointment ? `${appointment.visitor.name} with ${appointment.hostName}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={reschedule.isPending} disabled={!startTime}>Move appointment</Button>
        </>
      }
    >
      <TextField label="New date" type="date" min={todayKey()} value={date} onChange={(e) => { setDate(e.target.value); setStartTime('') }} />
      <SlotPicker
        label="New time"
        slots={pickerSlots}
        value={startTime}
        onChange={setStartTime}
        allowCaution={can(P.manage) || appointment?.canAct}
        loading={slots.isLoading}
        emptyText={slots.data?.reason || 'No times available on this day.'}
      />
    </Dialog>
  )
}

export const ReasonDialog: React.FC<{
  target: { appointment: Appointment; action: 'decline' | 'cancel' } | null
  onClose: () => void
}> = ({ target, onClose }) => {
  const [note, setNote] = useState('')
  const act = useAppointmentAction()
  useEffect(() => setNote(''), [target])
  const isCancel = target?.action === 'cancel'
  const run = async () => {
    if (!target) return
    try {
      await act.mutateAsync({ id: target.appointment._id, action: target.action, note })
      toast.success(ACTION_LABEL[target.action])
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      tone={isCancel ? 'danger' : 'default'}
      title={isCancel ? 'Cancel this appointment?' : 'Decline this request?'}
      description={target ? `${target.appointment.visitor.name}, ${dayLabel(target.appointment.date)} at ${formatTime(target.appointment.startTime)}. They are emailed if an address is on record.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>{isCancel ? 'Keep appointment' : 'Back'}</Button>
          <Button variant={isCancel ? 'danger' : 'primary'} onClick={run} loading={act.isPending}>
            {isCancel ? 'Cancel appointment' : 'Decline request'}
          </Button>
        </>
      }
    >
      <TextArea label="Reason" hint="Optional. Shared with the visitor." value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  )
}

/** Primary next step for an appointment, if the user can act on it. */
export const nextAction = (a: Appointment): { action: AppointmentAction; label: string } | null => {
  if (!a.canAct) return null
  if (a.status === 'requested') return { action: 'confirm', label: 'Confirm' }
  if (a.status === 'confirmed' && a.date <= todayKey()) return { action: 'check-in', label: 'Check in' }
  if (a.status === 'checked_in') return { action: 'complete', label: 'Mark completed' }
  return null
}

export const AppointmentSheet: React.FC<{
  appointment: Appointment | null
  onClose: () => void
  onReschedule: (a: Appointment) => void
  onReason: (a: Appointment, action: 'decline' | 'cancel') => void
}> = ({ appointment, onClose, onReschedule, onReason }) => {
  const act = useAppointmentAction()
  const saveNotes = useSaveNotes()
  const [notes, setNotes] = useState('')
  useEffect(() => setNotes(appointment?.outcomeNotes || ''), [appointment])
  if (!appointment) return <Sheet open={false} onClose={onClose} title="" />
  const a = appointment
  const primary = nextAction(a)
  const run = async (action: AppointmentAction) => {
    try {
      await act.mutateAsync({ id: a._id, action })
      toast.success(ACTION_LABEL[action])
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  const upcoming = a.status === 'requested' || a.status === 'confirmed'
  return (
    <Sheet
      open
      onClose={onClose}
      size="md"
      icon={CalendarDays}
      title={a.visitor.name}
      description={`${a.refNo} · ${dayLabel(a.date)}, ${timeRange(a)}`}
      footer={
        <>
          {a.canAct && a.status === 'requested' ? <Button onClick={() => onReason(a, 'decline')}>Decline</Button> : null}
          {a.canAct && a.status === 'confirmed' && a.date <= todayKey() ? <Button onClick={() => run('no-show')}>Mark no-show</Button> : null}
          {a.canAct && upcoming ? <Button onClick={() => onReschedule(a)}>Move</Button> : null}
          {a.canAct && a.status === 'confirmed' ? <Button onClick={() => onReason(a, 'cancel')}>Cancel appointment</Button> : null}
          {primary ? <Button variant="primary" onClick={() => run(primary.action)} loading={act.isPending}>{primary.label}</Button> : null}
          {!primary && !(a.canAct && upcoming) ? <Button onClick={onClose}>Close</Button> : null}
        </>
      }
    >
      <div className="ap-sheet-status">
        <StatusBadge status={a.status} />
        {a.hostAbsent ? <Badge tone="warning">Host absent today</Badge> : null}
        {a.overrideTeaching ? <Badge tone="neutral" dot={false}>During a teaching period</Badge> : null}
      </div>
      <DetailList
        items={[
          { label: 'Meeting with', value: a.hostName },
          { label: 'Visitor', value: visitorDetail(a) },
          { label: 'Phone', value: a.visitor.phone ? <a className="cb-link" href={`tel:${a.visitor.phone}`}>{a.visitor.phone}</a> : '' },
          { label: 'Email', value: a.visitor.email },
          { label: 'Purpose', value: a.purpose },
          { label: 'How', value: `${MODE_LABEL[a.mode]}${a.location ? ` · ${a.location}` : ''}` },
          { label: "What it's about", value: a.agenda, wide: true },
          ...(a.cancelReason ? [{ label: a.status === 'declined' ? 'Reason declined' : 'Reason cancelled', value: a.cancelReason, wide: true }] : []),
        ]}
      />
      {a.canSeeNotes ? (
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Meeting notes</h3>
          <TextArea
            label="Private notes"
            hint="Only the person they met and the principal can read these."
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await saveNotes.mutateAsync({ id: a._id, notes })
                  toast.success('Notes saved.')
                } catch (error) {
                  toast.error(errorMessage(error))
                }
              }}
              loading={saveNotes.isPending}
              disabled={notes === (a.outcomeNotes || '')}
            >
              Save notes
            </Button>
          </div>
        </div>
      ) : null}
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">History</h3>
        <ol className="ap-timeline">
          {[...a.timeline].reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className="cb-strong">{STATUS_META[entry.status]?.label || entry.status}</span>
              <span className="cb-subtle">
                {' '}
                {new Date(entry.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                {entry.by ? ` · ${entry.by}` : ''}
              </span>
              {entry.note ? <p className="cb-muted">{entry.note}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  )
}

// ── Availability editor ─────────────────────────────────────────────────────

export type AvailabilityDraft = Required<Pick<HostPayload, 'slotMinutes' | 'bufferMinutes' | 'maxPerDay' | 'weeklyAvailability' | 'blockedDates' | 'location'>>

export const toAvailabilityDraft = (host?: Partial<AppointmentHost>): AvailabilityDraft => ({
  slotMinutes: host?.slotMinutes ?? 15,
  bufferMinutes: host?.bufferMinutes ?? 0,
  maxPerDay: host?.maxPerDay ?? 0,
  weeklyAvailability: host?.weeklyAvailability ? host.weeklyAvailability.map((w) => ({ ...w })) : [1, 2, 3, 4, 5].map((day) => ({ day, start: '13:30', end: '15:00' })),
  blockedDates: host?.blockedDates ? host.blockedDates.map((b) => ({ date: b.date, reason: b.reason || '' })) : [],
  location: host?.location || '',
})

/** Returns the first problem with the hours, or null. */
export const availabilityError = (draft: AvailabilityDraft) => {
  const bad = draft.weeklyAvailability.find((w) => !w.start || !w.end || w.end <= w.start)
  if (bad) return `${WEEKDAYS[bad.day]}: the end time must be after the start time`
  const blank = draft.blockedDates.find((b) => !b.date)
  if (blank) return 'Choose a date for each day off, or remove it'
  return null
}

const MINUTES = [10, 15, 20, 30, 45, 60]
const BUFFERS = [0, 5, 10, 15]

export const AvailabilityFields: React.FC<{ value: AvailabilityDraft; onChange: (next: AvailabilityDraft) => void }> = ({ value, onChange }) => {
  const set = <K extends keyof AvailabilityDraft>(key: K, v: AvailabilityDraft[K]) => onChange({ ...value, [key]: v })
  const setWindow = (index: number, patch: Partial<WeeklyWindow>) =>
    set('weeklyAvailability', value.weeklyAvailability.map((w, i) => (i === index ? { ...w, ...patch } : w)))
  const sortedDays = [1, 2, 3, 4, 5, 6, 0]
  return (
    <>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Weekly hours</h3>
        {value.weeklyAvailability.length === 0 ? <p className="cb-muted">No hours yet. Nobody can book until you add some.</p> : null}
        <div className="ap-hours">
          {value.weeklyAvailability.map((w, index) => (
            <div className="ap-hours__row" key={index}>
              <Select
                size="sm"
                aria-label="Day"
                options={sortedDays.map((day) => ({ value: String(day), label: WEEKDAYS[day] }))}
                value={String(w.day)}
                onChange={(e) => setWindow(index, { day: Number(e.target.value) })}
              />
              <TextField size="sm" type="time" aria-label="From" value={w.start} onChange={(e) => setWindow(index, { start: e.target.value })} />
              <span className="cb-muted">to</span>
              <TextField size="sm" type="time" aria-label="To" value={w.end} onChange={(e) => setWindow(index, { end: e.target.value })} />
              <Button
                size="sm"
                variant="tertiary"
                icon={Trash2}
                aria-label={`Remove ${WEEKDAYS[w.day]} hours`}
                onClick={() => set('weeklyAvailability', value.weeklyAvailability.filter((_, i) => i !== index))}
              />
            </div>
          ))}
        </div>
        <div>
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              const last = value.weeklyAvailability[value.weeklyAvailability.length - 1]
              set('weeklyAvailability', [...value.weeklyAvailability, { day: last ? (last.day + 1) % 7 : 1, start: last?.start || '13:30', end: last?.end || '15:00' }])
            }}
          >
            Add hours
          </Button>
        </div>
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Each meeting</h3>
        <div className="cb-form-grid cb-form-grid--3">
          <Select label="Length" options={MINUTES.map((m) => ({ value: String(m), label: `${m} minutes` }))} value={String(value.slotMinutes)} onChange={(e) => set('slotMinutes', Number(e.target.value))} />
          <Select label="Gap between meetings" options={BUFFERS.map((m) => ({ value: String(m), label: m ? `${m} minutes` : 'No gap' }))} value={String(value.bufferMinutes)} onChange={(e) => set('bufferMinutes', Number(e.target.value))} />
          <TextField label="Most per day" type="number" min={0} max={100} hint="0 means no limit" value={String(value.maxPerDay)} onChange={(e) => set('maxPerDay', Math.max(0, Number(e.target.value) || 0))} />
        </div>
        <TextField label="Where" hint="For example, Principal's office" value={value.location} onChange={(e) => set('location', e.target.value)} />
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Days off</h3>
        {value.blockedDates.length === 0 ? <p className="cb-muted">No days off planned.</p> : null}
        <div className="ap-hours">
          {value.blockedDates.map((b, index) => (
            <div className="ap-hours__row ap-hours__row--off" key={index}>
              <TextField size="sm" type="date" aria-label="Date" value={b.date} onChange={(e) => set('blockedDates', value.blockedDates.map((x, i) => (i === index ? { ...x, date: e.target.value } : x)))} />
              <TextField size="sm" aria-label="Reason" placeholder="Reason (optional)" value={b.reason || ''} onChange={(e) => set('blockedDates', value.blockedDates.map((x, i) => (i === index ? { ...x, reason: e.target.value } : x)))} />
              <Button size="sm" variant="tertiary" icon={Trash2} aria-label="Remove day off" onClick={() => set('blockedDates', value.blockedDates.filter((_, i) => i !== index))} />
            </div>
          ))}
        </div>
        <div>
          <Button size="sm" icon={Plus} onClick={() => set('blockedDates', [...value.blockedDates, { date: '', reason: '' }])}>Add a day off</Button>
        </div>
      </div>
    </>
  )
}

/** Parent-request rules for a host. */
export const HostRulesFields: React.FC<{
  value: Pick<HostPayload, 'requiresApproval' | 'parentBookable' | 'parentVisibility'>
  onChange: (patch: Partial<HostPayload>) => void
}> = ({ value, onChange }) => (
  <div className="cb-form-section">
    <h3 className="cb-form-section__title">Requests from parents</h3>
    <Checkbox
      label="Parents can request a meeting in the family portal"
      checked={Boolean(value.parentBookable)}
      onChange={(checked) => onChange({ parentBookable: checked })}
    />
    {value.parentBookable ? (
      <RadioGroup
        label="Which parents"
        options={[
          { value: 'all', label: 'All parents' },
          { value: 'linked', label: 'Only parents of students they teach', description: 'Uses the timetable and assigned classes.' },
        ]}
        value={value.parentVisibility || 'all'}
        onChange={(v) => onChange({ parentVisibility: v as 'all' | 'linked' })}
      />
    ) : null}
    <Checkbox
      label="Requests need approval"
      description="When off, a parent's request is confirmed straight away."
      checked={value.requiresApproval !== false}
      onChange={(checked) => onChange({ requiresApproval: checked })}
    />
  </div>
)
