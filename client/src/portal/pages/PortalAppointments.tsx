import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarClock, CalendarPlus, X } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Entity,
  Menu,
  Page,
  PageHeader,
  Select,
  Sheet,
  SlotPicker,
  TextArea,
  TextField,
  formatDate,
  formatTime,
  type DataTableColumn,
  type Tone,
} from '@/components/ui'
import { usePortal } from '../PortalContext'
import {
  useCancelAppointment,
  usePortalAppointmentHosts,
  usePortalAppointmentSlots,
  usePortalAppointments,
  useRequestAppointment,
} from '../usePortal'
import type { PortalAppointment, PortalAppointmentStatus } from '../portalService'
import { LoadFailed, NoChild } from './shared'

const STATUS: Record<PortalAppointmentStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Waiting for the school', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  checked_in: { label: 'At school', tone: 'success' },
  completed: { label: 'Met', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_show: { label: 'Missed', tone: 'danger' },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MODES = [
  { value: 'in_person', label: 'At school' },
  { value: 'phone', label: 'Phone call' },
  { value: 'video', label: 'Video call' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayKey = () => dateKey(new Date())
const plusDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return dateKey(d)
}
const when = (a: PortalAppointment) => {
  const d = new Date(`${a.date}T00:00:00`)
  return `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${formatDate(d)}, ${formatTime(a.startTime)}`
}
const isUpcoming = (a: PortalAppointment) => (a.status === 'requested' || a.status === 'confirmed') && a.date >= todayKey()

/** Request form: one child, one person, one slot. */
const RequestSheet: React.FC<{ open: boolean; onClose: () => void; purposes: string[]; maxAdvanceDays: number }> = ({ open, onClose, purposes, maxAdvanceDays }) => {
  const { child } = usePortal()
  const hosts = usePortalAppointmentHosts(child?.studentId, open)
  const [hostId, setHostId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [purpose, setPurpose] = useState('')
  const [mode, setMode] = useState('in_person')
  const [agenda, setAgenda] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const slots = usePortalAppointmentSlots(child?.studentId, hostId, date)
  const request = useRequestAppointment()

  useEffect(() => {
    if (!open) return
    setHostId('')
    setDate(plusDays(1))
    setStartTime('')
    setPurpose('')
    setMode('in_person')
    setAgenda('')
    setPhone('')
    setError('')
  }, [open])

  const host = (hosts.data || []).find((row) => row._id === hostId)
  const pickerSlots = useMemo(
    () => (slots.data?.slots || []).map((slot) => ({ start: slot.start, end: slot.end, state: slot.open ? 'free' as const : 'busy' as const, reason: slot.open ? '' : 'Not available' })),
    [slots.data]
  )

  const submit = async () => {
    if (!child) return
    if (!hostId) return setError('Choose who you want to meet')
    if (!startTime) return setError('Choose a time')
    if (!purpose) return setError('Choose what it is about')
    setError('')
    try {
      const appointment = await request.mutateAsync({ studentId: child.studentId, payload: { hostId, date, startTime, purpose, agenda, mode: mode as 'in_person', phone } })
      toast.success(appointment.status === 'confirmed' ? 'Your meeting is confirmed.' : 'Request sent. The school will confirm it.')
      onClose()
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(message || "Couldn't send the request. Try again.")
      slots.refetch()
    }
  }

  const noHosts = hosts.isSuccess && (hosts.data || []).length === 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      icon={CalendarPlus}
      title="Request a meeting"
      description={child ? `About ${child.name}` : undefined}
      onSubmit={(event) => { event.preventDefault(); submit() }}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={request.isPending} disabled={noHosts}>Send request</Button>
        </>
      }
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {noHosts ? (
        <Banner tone="info" title="No one is taking online requests for this class">Call the school office to set up a meeting.</Banner>
      ) : (
        <>
          <Select
            label="Meet with"
            placeholder={hosts.isLoading ? 'Loading…' : 'Choose a person'}
            options={(hosts.data || []).map((row) => ({ value: row._id, label: row.title ? `${row.displayName} · ${row.title}` : row.displayName }))}
            value={hostId}
            onChange={(e) => { setHostId(e.target.value); setStartTime('') }}
            hint={host?.days.length ? `Meets on ${[...host.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join(', ')}` : undefined}
          />
          <TextField
            label="Date"
            type="date"
            min={todayKey()}
            max={plusDays(maxAdvanceDays)}
            value={date}
            onChange={(e) => { setDate(e.target.value); setStartTime('') }}
          />
          {hostId ? (
            <SlotPicker
              label="Time"
              slots={slots.data?.closed ? [] : pickerSlots}
              value={startTime}
              onChange={setStartTime}
              loading={slots.isLoading}
              emptyText={slots.data?.reason || 'No times available on this day. Try another date.'}
              hint={host?.location ? `Meetings are at ${host.location}.` : undefined}
            />
          ) : null}
          <Select label="About" placeholder="Choose" options={purposes} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          <Select label="How" options={MODES} value={mode} onChange={(e) => setMode(e.target.value)} />
          <TextArea label="Anything to share first" hint="Optional" value={agenda} onChange={(e) => setAgenda(e.target.value)} />
          <TextField label="Phone" type="tel" inputMode="tel" hint="Optional. Leave empty to use the number the school has." value={phone} onChange={(e) => setPhone(e.target.value)} />
        </>
      )}
    </Sheet>
  )
}

/** Meetings a parent has asked for or the school has booked with them. */
const PortalAppointments: React.FC = () => {
  const { child, isParent } = usePortal()
  const list = usePortalAppointments()
  const cancel = useCancelAppointment()
  const [requesting, setRequesting] = useState(false)
  const [cancelling, setCancelling] = useState<PortalAppointment | null>(null)
  const [reason, setReason] = useState('')

  if (!child) return <Page><NoChild /></Page>

  const data = list.data
  const items = data?.items || []
  const canRequest = Boolean(isParent && data?.allowRequests)

  const columns: DataTableColumn<PortalAppointment>[] = [
    { key: 'when', header: 'When', mobile: 'subtitle', render: (a) => when(a) },
    { key: 'with', header: 'With', mobile: 'title', render: (a) => <Entity primary={a.hostName} secondary={[a.purpose, a.studentSnapshot?.name].filter(Boolean).join(' · ')} /> },
    { key: 'status', header: 'Status', mobile: 'aside', render: (a) => <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge> },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      interactive: true,
      width: 48,
      render: (a) => (isUpcoming(a)
        ? <Menu label={`Actions for ${when(a)}`} items={[{ label: 'Cancel meeting', icon: X, tone: 'danger', onSelect: () => { setReason(''); setCancelling(a) } }]} />
        : null),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Meetings"
        subtitle="Meetings with teachers and the principal"
        actions={canRequest ? <Button variant="primary" icon={CalendarPlus} onClick={() => setRequesting(true)}>Request a meeting</Button> : undefined}
      />
      {list.isError ? <LoadFailed what="Meetings" /> : null}
      {data && !data.allowRequests && isParent ? (
        <Banner tone="info" title="The school is not taking meeting requests online">Call the school office to set up a meeting. Meetings the school books with you appear here.</Banner>
      ) : null}
      <Card flush>
        <DataTable
          caption="Meetings"
          columns={columns}
          rows={items}
          getRowKey={(a) => a._id}
          loading={list.isLoading}
          loadingLabel="Loading meetings"
          empty={
            <EmptyState
              icon={CalendarClock}
              title="No meetings yet"
              body={canRequest ? 'Request a meeting with a teacher or the principal.' : 'Meetings the school books with you will appear here.'}
              action={canRequest ? <Button variant="primary" icon={CalendarPlus} onClick={() => setRequesting(true)}>Request a meeting</Button> : undefined}
            />
          }
        />
      </Card>

      {canRequest ? <RequestSheet open={requesting} onClose={() => setRequesting(false)} purposes={data?.purposes || []} maxAdvanceDays={data?.maxAdvanceDays || 30} /> : null}

      <Dialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        tone="danger"
        title="Cancel this meeting?"
        description={cancelling ? `${cancelling.hostName}, ${when(cancelling)}` : undefined}
        footer={
          <>
            <Button onClick={() => setCancelling(null)}>Keep meeting</Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={async () => {
                if (!cancelling) return
                try {
                  await cancel.mutateAsync({ id: cancelling._id, reason })
                  toast.success('Meeting cancelled.')
                  setCancelling(null)
                } catch (err) {
                  toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't cancel. Try again.")
                }
              }}
            >
              Cancel meeting
            </Button>
          </>
        }
      >
        <TextArea label="Reason" hint="Optional. Shared with the school." value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </Page>
  )
}

export default PortalAppointments
